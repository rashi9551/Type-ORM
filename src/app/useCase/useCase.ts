import { Node, NodeType } from "../../entity/org-tree";
import { StatusCode } from "../../interfaces/enum";
import { deleteData, NodeData, NodePromise, TreePromise } from "../../interfaces/interface";
import { buildTree } from "../../middleware/buildTree";
import Repo from "../repository/repo";

const colorPool = [
    "#F6AF8E", "#C3A5FF", "#B1D0A5", "#F6ED8E", 
    "#8EF4F6", "#C0F68E", "#F68ECB", "#8E97F6", 
    "#F68EAB", "#F6CE8E", "#DFF68E"
];

let lastAssignedColorIndex: number = 0; // Tracks the last color index globally

export default new class UseCase {
    
    createNode = async (nodeData: NodeData): Promise<NodePromise> => {
        try {
            if (!nodeData.type) {
                return { status: 400, message: "Node type is required." }; // Bad request
            }

            if (!Object.values(NodeType).includes(nodeData.type)) {
                return { status: 400, message: `Invalid node type. Allowed types are: ${Object.values(NodeType).join(', ')}.` };
            }

            // Case for root node creation (no parent)
            if (!nodeData.parentId) {
                nodeData.color = "white"; // Default color for root node
                const node = await Repo.createNode(nodeData);
                return { status: StatusCode.Created as number, node, message: "Root node created successfully" };
            }

            // Check if the parent node exists
            const parentExists = await Repo.nodeExists(nodeData.parentId);
            if (!parentExists) {
                return { status: StatusCode.NotFound as number, message: `Parent node with ID ${nodeData.parentId} does not exist.` };
            }

            // Assign color for location or department nodes
            if (nodeData.type === "location" || nodeData.type === "department") {
                nodeData.color = colorPool[lastAssignedColorIndex]; // Assign the next color from the pool
                console.log(lastAssignedColorIndex,colorPool[lastAssignedColorIndex]);
                lastAssignedColorIndex++; // Increment the color index

                // Reset the color index if it exceeds the pool length
                if (lastAssignedColorIndex >= colorPool.length) {
                    lastAssignedColorIndex = 0;
                }
            } else {
                // For other nodes, inherit color from the parent node
                try {
                    const parentNode = await Repo.findNodeById(nodeData.parentId);
                    if (parentNode) {
                        nodeData.color = parentNode.color; // Inherit parent's color
                    } else {
                        throw new Error(`Parent node with ID ${nodeData.parentId} not found`);
                    }
                } catch (error) {
                    console.error("Error fetching parent node:", error);
                    throw error;
                }
            }

            // Create the node under the specified parent
            const node = await Repo.createNode(nodeData);
            return { status: StatusCode.Created as number, node, message: "Node created successfully" };

        } catch (error) {
            console.error("Error during node creation:", error);
            return { status: StatusCode.InternalServerError as number, message: "Error when creating node" };
        }
    }

    async checkForCycle(nodeId: number, newParentId: number): Promise<boolean> {
        const descendants: number[] = [];
    
        // Recursive function to get all descendants of a node
        async function getChildren(parentId: number): Promise<void> {
            try {
                const children = await Repo.findChildrenOfNode(parentId); // Fetch direct children of the current node
                for (const child of children) {
                    descendants.push(child.id); // Add child ID to descendants list
                    await getChildren(child.id); // Recursively get children of this child
                }
            } catch (error) {
                console.error(`Error fetching children of node ${parentId}:`, error);
                throw new Error(`Error fetching descendants for node ${parentId}`);
            }
        }
    
        try {
            await getChildren(nodeId); // Start finding descendants from the given nodeId

            // After collecting descendants, check if newParentId is in descendants
            if (descendants.includes(newParentId)) {
                return true; // A cycle would be created
            } else {
                return false; // No cycle detected
            }
        } catch (error) {
            console.error(`Error fetching descendants for node ${nodeId}:`, error);
            throw new Error(`Failed to retrieve all descendants for node ${nodeId}`);
        }
    }
    
    
    
    updateNode = async (nodeData: Partial<NodeData>): Promise<NodePromise> => {
        try {
            
            const node = await Repo.findNodeById(nodeData.id);
            if(node.id==node.parentId)return { status: StatusCode.BadRequest as number, message: "Updating this node's parent would create a cycle." };

            if (!node) return { status: StatusCode.NotFound as number, message: `Node with ID ${nodeData.id} does not exist.` };
            
    
            // Check for cycle if parent ID is being updated
            if (nodeData.parentId && nodeData.parentId !== node.parentId) {
                const isCycle = await this.checkForCycle(nodeData.id, nodeData.parentId);
                if (isCycle) {
                    return { status: StatusCode.BadRequest as number, message: "Updating this node's parent would create a cycle." };
                }
            }
    
            // Update node attributes
            if (nodeData.name) node.name = nodeData.name; 
            if (nodeData.type) node.type = nodeData.type; 
            
            // Option to move child nodes with the current node or shift them up
            if (nodeData.parentId && nodeData.parentId !== node.parentId) {
                if (nodeData.isWantToMove) {
                    await this.moveChildrenToNewParent(node.id, nodeData.parentId);
                } else if(!nodeData.isWantToMove) {
                    await this.shiftChildrenOneLevelUp(node.id,node.parentId);
                }
            }
            if(nodeData.parentId)node.parentId=nodeData.parentId
            
            // Save updated node in the database
            let parentColor = (await Repo.findNodeById(nodeData.parentId)).color;
            if (node.type === "location" || node.type === "department") {
                parentColor = node.color; 
            } else {
                node.color = parentColor;
            }
            const updatedNode = await Repo.updateNode(node);
            return { status: StatusCode.OK as number, node: updatedNode, message: "Node updated successfully." };
    
        } catch (error) {
            console.error("Error during node update:", error);
            return { status: StatusCode.InternalServerError as number, message: "Error updating node." };
        }
    }
    

    private moveChildrenToNewParent = async (nodeId: number, newParentId: number) => {
        try {
            let parentColor = (await Repo.findNodeById(newParentId)).color;
            console.log(nodeId, newParentId, "Propagating color change");
    
            const children = await Repo.findChildrenOfNode(nodeId);
    
            for (const child of children) {
                if (child.type === "location" || child.type === "department") {
                    parentColor = child.color; 
                } else {
                    child.color = parentColor;
                }
                // Update child node with new parent ID and potentially new color
                await Repo.updateNode({ ...child });            
            }
        } catch (error) {
            console.error("Error in moveChildrenToNewParent:", error);
            throw error; // Rethrow error to handle at a higher level if necessary
        }
    };
    
    private shiftChildrenOneLevelUp = async (nodeId: number, levelUpParentId: number) => {
        try {
            let parentColor = (await Repo.findNodeById(levelUpParentId)).color;
            const children = await Repo.findChildrenOfNode(nodeId);
            
            for (const child of children) {
                if (child.type === "location" || child.type === "department") {
                    parentColor = child.color; 
                } else {
                    child.color = parentColor;
                }
                
                console.log(`Shifting child ${child.id} to parent ${levelUpParentId}`);
                await Repo.updateNode({ ...child, parentId: levelUpParentId });
            }
        } catch (error) {
            console.error("Error in shiftChildrenOneLevelUp:", error);
            throw error; // Rethrow error to handle at a higher level if necessary
        }
    };
    
    
    removeNode = async (deleteData: deleteData): Promise<NodePromise> => {
        try {
            const node = await Repo.findNodeById(deleteData.id);
            if (!node) {
                return { status: StatusCode.NotFound as number, message: `Node with ID ${deleteData.id} does not exist.` };
            }
    
            // Prevent deleting the root node (organization)
            if (node.type === 'organization') {
                return { status: StatusCode.BadRequest as number, message: "Deleting the root node will deprecate the entire organization tree." };
            }
    
            // Remove node based on the condition of shifting children or not
            await Repo.removeNode(deleteData.id, deleteData.shiftChildren);
            const message = deleteData.shiftChildren 
                ? "Node removed and children shifted one level up." 
                : "Node and all child nodes removed successfully.";
                
            return { status: StatusCode.OK as number, message };
    
        } catch (error) {
            console.error("Error during node removal:", error);
            return { status: StatusCode.InternalServerError as number, message: "Error removing node." };
        }
    };
    
    
    getTree = async (): Promise<TreePromise > => {
        try {
           const getFullTree:Node[]=await Repo.getTree()
            const tree=buildTree(getFullTree)
           return { status: StatusCode.OK as number, tree, message: "Tree fetched succes fully" };
        } catch (error) {
            console.error("Error during fetching tree:", error);
            return { status: StatusCode.InternalServerError as number, message: "Error when creating node" };
        }
    }
   
}