import { validateOrReject } from 'class-validator';
import { User } from '../../entity/User';
import { StatusCode } from '../../interfaces/enum';
import {  FcmData, FilterOptions, PromiseReturn,  RemoveContributes,  RoleName,  TaskCommentData,  TaskData, TaskHistoryAction, TaskType, Type } from '../../interfaces/interface';
import { Task, TaskStatus} from '../../entity/Task';
import UserRepo from '../repository/UserRepo';
import TaskRepo from '../repository/TaskRepo';
import { Notification } from '../../entity/Notification';
import { TaskHistory } from '../../entity/TaskHistory';
import { TaskComment } from '../../entity/TaskComment';
import TaskValidator  from '../../middleware/validateTaskData';
import { checkTaskPermission, handleError, handleHistoryAndNotifications, handleTaskUpdate } from '../../middleware/updateMiddleware';
import getDateRanges from '../../utils/getDataRange';
import admin from '../../config/firbaseConfig';

const taskValidator=new TaskValidator()

export default new class TaskUseCase {
    
    createTask = async (taskData: TaskData,loggedUserId:number): Promise<PromiseReturn> => {
        try {  
            const task = new Task();
            const { due_date, ...rest } = taskData;
            let flag:boolean=true
            task.due_date = new Date(due_date); // Convert the string to a Date object
            if (!taskValidator.validateTaskData(taskData)) {
                return { 
                    status: StatusCode.BadRequest as number, 
                    message: "Invalid task data. Please check the provided fields."
                };
            }
            Object.assign(task, rest); // Assign other properties to the task entity
            await validateOrReject(task);

            if (!Object.values(Type).includes(taskData.type)) {
                return {
                    status: StatusCode.BadRequest as number,
                    message: `Invalid task type. Valid types are: ${Object.values(Type).join(', ')}`
                };
            }
            if(taskData.brand_id){
            flag=false
                const existingBrand = await UserRepo.getBrandDetail(taskData.brand_id);     
                    
                if (!existingBrand) return {status: StatusCode.NotFound as number,message: "Brand not found",};
            }
            if(taskData.inventoryId){
            flag=false
                const existingInventory= await UserRepo.findInventoryById(taskData.inventoryId);            
                if (!existingInventory) return {status: StatusCode.NotFound as number,message: "Inventory not found",};
            }
            if(taskData.eventId){
            flag=false
                const existingEvent= await UserRepo.findEventById(taskData.eventId);            
                if (!existingEvent) return {status: StatusCode.NotFound as number,message: "Event not found",};
            }
            if(flag)task.type===Type.General

             // Check if the assignedUser exists
            const assignedUser: User = await UserRepo.getUserById(taskData.assigned_to);
            const createdUser: User = await UserRepo.getUserById(taskData.created_by);

            if (!assignedUser) return { status: StatusCode.NotFound as number, message: "AssignedUser Not Found" };
            if (!createdUser) return { status: StatusCode.NotFound as number, message: "CreatedUser Not Found" }; 

            
            const taskCreating=await TaskRepo.createTask(taskData)
            const contributionResult = await this.handleContributions(taskData.contributes, taskCreating.id);
                if (contributionResult.status !== StatusCode.Created) {
                    return contributionResult; // Return early if there was an error
            }
            await this.NotificationSending(`You have been assigned a new task: ${taskCreating.title}`,taskCreating,assignedUser,taskData.assigned_to,taskData.contributes,`You have been contributed a new task: ${taskCreating.title}`)
            await this.TaskHistoryLogging(taskCreating,TaskHistoryAction.TASK_CREATED,`The Task ${taskCreating.title} was created by ${createdUser.name} and assigned to ${assignedUser.name}`,loggedUserId)
            return { status: StatusCode.Created as number, message: "Task created successfully.",Task:taskCreating };
    
        } catch (error) {
            if (Array.isArray(error) && error.length > 0) {
                const firstError = error[0];
                const firstConstraintKey = Object.keys(firstError.constraints || [])[0];
                const firstConstraintMessage = firstError.constraints[firstConstraintKey];
                const fieldName = firstError.property;
                return { status: StatusCode.BadRequest as number, message: `${fieldName}: ${firstConstraintMessage}`};
            }
            
            console.error("Error during task creation:", error);
            return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
        }
    };


    updateTask = async (taskData: TaskData, loggedUserId?: number, roles?: string[]): Promise<PromiseReturn> => {
        try {
            // Validate the task data
            console.log(taskData,'=-=-=-=-=-=-------------');
            
            const validationResult = taskValidator.validateTaskData(taskData);
            if (!validationResult.valid) {
                return { status: StatusCode.BadRequest as number, message: validationResult.message };
            }
    
            // Fetch the existing task
            const existingTask = await TaskRepo.findTaskById(taskData.id);
            if (!existingTask) {
                return { status: StatusCode.NotFound as number, message: "Task not found." };
            }
            
            await this.validateUserAndBrand(taskData)
    
            // Permission check
            const hasPermission = checkTaskPermission(existingTask, loggedUserId, roles);
            if (!hasPermission) {
                return {
                    status: StatusCode.Unauthorized as number,
                    message: "You don't have permission to update this task.",
                };
            }
    
            // Check if task is completed and cannot be updated
            if (existingTask.status === TaskStatus.Completed) {
                return { status: StatusCode.BadRequest as number, message: "Cannot update a completed task." };
            }
    
            try {
                const assignedTo=existingTask.assignedTo
                const createdBy=existingTask.createdBy
                delete existingTask.assignedTo
                delete existingTask.createdBy
                // Handle task status update and reassignment logic
                const { isGeneralUpdate, isStatusChanging, updatedTask } = await handleTaskUpdate(existingTask, taskData, loggedUserId);
                console.log(isGeneralUpdate, isStatusChanging, updatedTask, "this was reassigning time okey");
                const savedTask = await TaskRepo.saveTask(updatedTask); // <--- Saving the updated task here  


                const contributionResult = await this.handleContributions(taskData.contributes, savedTask.id);
                if (contributionResult.status !== StatusCode.Created) {
                    return contributionResult; // Return early if there was an error
                }
                // Further logic for saving and processing the updated task
                const { taskHistory, notification } = await handleHistoryAndNotifications(isGeneralUpdate, isStatusChanging, savedTask, loggedUserId,assignedTo,createdBy);
                delete notification?.task
                return { status: 200, message: "Task updated successfully", taskHistory, Notification:notification,Task:savedTask };
            
            } catch (error) {
                // Handle the error properly using handleError
                return handleError(error);
            }
        } catch (error) {
            return handleError(error);
        }
    };


    async handleContributions(contributeIds: number[], taskId: number): Promise<PromiseReturn> {
        try {
            // Check if there are contributions to process
            if (contributeIds && contributeIds.length > 0) {
                // Fetch all users in one query
                const contributedUsers = await UserRepo.findUsersByIds(contributeIds);
                const invalidUserIds = contributeIds.filter(id => !contributedUsers.some(user => user.id === id));
    
                // Check for invalid user IDs
                if (invalidUserIds.length > 0) {
                    return {
                        status: StatusCode.BadRequest as number,
                        message: `Contributed users not found for IDs: ${invalidUserIds.join(', ')}.`
                    };
                }
    
                // Check existing contributions for the task
                const existingContributions = await TaskRepo.findContributionsByTaskId(taskId);
                const existingUserIds = existingContributions.map(contribution => contribution.userId);
                
                // Filter out users that already contributed
                const newContributions = contributedUsers.filter(user => !existingUserIds.includes(user.id));
    
                if (newContributions.length === 0) {
                    return {
                        status: StatusCode.Conflict as number,
                        message: "All contributed users already exist for this task."
                    };
                }
    
                // Prepare contribute task data for bulk save
                const contributeData = newContributions.map(user => ({
                    userId: user.id,
                    taskId: taskId // Assuming TaskRepo can handle associations
                }));
    
                // Bulk save contributions
                await TaskRepo.saveContributeData(contributeData); // Save contributions
            }
    
            return { status: StatusCode.Created as number, message: "Contributions processed successfully." };
        } catch (error) {
            console.error("Error handling contributions:", error);
            return {
                status: StatusCode.InternalServerError as number,
                message: "An error occurred while processing contributions."
            };
        }
    }
    


    validateUserAndBrand=async(taskData: TaskData) =>{
        if (taskData.assigned_to) {
            const assignedUser = await UserRepo.getUserById(taskData.assigned_to);
            if (!assignedUser) throw { status: StatusCode.NotFound as number, message: "Assigned user not found." };
        }
        if (taskData.created_by) {
            const createdUser = await UserRepo.getUserById(taskData.created_by);
            if (!createdUser) throw { status: StatusCode.NotFound as number, message: "Created user not found." };
        }
        if (taskData.brand_id) {
            const existingBrand = await UserRepo.getBrandDetail(taskData.brand_id);
            if (!existingBrand) throw { status: StatusCode.NotFound as number, message: "Brand not found." };
        }
        if (taskData.inventoryId) {
            const existingInventory = await UserRepo.findInventoryById(taskData.inventoryId);
            if (!existingInventory) throw { status: StatusCode.NotFound as number, message: "Inventory not found." };
        }
        if (taskData.eventId) {
            const existingEvent = await UserRepo.findEventById(taskData.eventId);
            if (!existingEvent) throw { status: StatusCode.NotFound as number, message: "Event not found." };
        }
    }


    deleteTask = async (taskId:number,loggedUserId:number,roles:string[]): Promise<PromiseReturn> => {
        try {  
            const existingTask = await TaskRepo.findTaskById(taskId);            
            if (!existingTask) {
                return { status: StatusCode.NotFound as number, message: "Task not found." };
            }

            const hasAccess = existingTask.created_by === loggedUserId 
            if (!hasAccess) {
                return { 
                    status: StatusCode.Unauthorized as number, 
                    message: `You do not have permission to remove this task: ${existingTask.title}.` 
                };
            }
           await TaskRepo.deleteTask(taskId);
            return { status: StatusCode.OK as number, message: "Task deleted Successfully."};
        }
        catch (error) {
                console.error("Error during getting task :", error);
                return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
        }
    };

    
    getTasks = async (filter: TaskType, loggedUserId: number, role?: string[], isCompleted?: boolean, page: number = 1, pageSize: number = 10): Promise<PromiseReturn> => {
        try {  
            let tasks: Task[];
            let totalCount: number;
    
            if (filter === TaskType.AllTasks) {
                const result = await TaskRepo.getAllTasks(isCompleted, page, pageSize);
                tasks = result.tasks;
                totalCount = result.totalCount; // Assuming the method returns both tasks and the total count
                return { status: StatusCode.OK as number, message: "Successfully fetched All Tasks", task:tasks, totalCount };
            } 
            if(filter===TaskType.YourTasks){
                const tasks = await TaskRepo.getYourTask(loggedUserId,isCompleted);            
                if (tasks) return {status: StatusCode.OK as number,message: "Successfully fetched your Tasks",task:tasks};
            } 
            if(filter===TaskType.TeamTasks){
                const hasAccess = role?.some(r => [RoleName.TO].includes(r as RoleName));
                if (hasAccess) {
                    const {totalCount,tasks} = await TaskRepo.getTeamTask(loggedUserId, isCompleted, page, pageSize);            
                    if (tasks) return {status: StatusCode.OK as number,message: "Successfully fetched team Tasks",task:tasks,totalCount};
                } else {
                    return {status: StatusCode.Unauthorized as number,message: "only TO Can View The TeamTask",};
                }
            } 
            if(filter===TaskType.DelegatedToOthers){
                const {tasks,totalCount} = await TaskRepo.getDelegatedToOthersTask(loggedUserId, isCompleted, page, pageSize);            
                if (tasks) return {status: StatusCode.OK as number,message: "Successfully fetched DelegatedToOthers Tasks",task:tasks,totalCount};
            } 
            return { status: StatusCode.BadRequest as number, message: "select appropriate filter." };
        }
        catch (error) {
            
            if (error.message === "admin can't have the team task") {
                return {
                    status: StatusCode.Forbidden as number,
                    message: error.message, // Admin-specific message
                };
            }
                console.error("Error during getting asll task:", error);
                return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
        }
    };


    getAllAssignedToUsers = async(page: number = 1, pageSize: number = 10):Promise<PromiseReturn>=> {
        try {
            // Fetch all unique assignedTo users from tasks
            const [assignedToUsers, totalCount] = await TaskRepo.findAllAssignedToUsers(page, pageSize);
    
            // Check if any users were found
            if (assignedToUsers.length === 0) {
                return { status: StatusCode.NotFound as number, message: "No users assigned to tasks found." };
            }
    
            return {
                status: StatusCode.OK as number,
                message: 'Assigned users fetched successfully.',
                user:assignedToUsers,
                totalCount, // Total count of unique users assigned to tasks
            };
        } catch (error) {
            console.error("Error during fetching all assigned users:", error);
            return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
        }
    };


    getAllAssignedByUsers=async(page: number = 1, pageSize: number = 10): Promise<PromiseReturn> =>{
        try {
            // Fetch all unique assignedBy users from tasks
            const [assingedByUsers, totalCount] = await TaskRepo.findAllAssignedByUsers(page, pageSize);
    
            // Check if any users were found
            if (assingedByUsers.length === 0) {
                return { status: StatusCode.NotFound as number, message: "No users assigned to tasks found." };
            }
    
            return {
                status: StatusCode.OK as number,
                message: 'Assigned users fetched successfully.',
                user:assingedByUsers,
                totalCount, // Total count of unique users assigned to tasks
            };
        } catch (error) {
            console.error("Error during fetching all assigned users:", error);
            return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
        }
    };

    

    getTask = async (taskId:number): Promise<PromiseReturn> => {
        try {  
            const existingTask = await TaskRepo.findTaskById(taskId);
            return { status: StatusCode.OK as number, message: "Task Fetched By Id Successfully." ,Task:existingTask};
        }catch (error) {
                console.error("Error during getting task :", error);
                return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
            }
    };


    getNotification = async (userId:number,page: number , pageSize: number): Promise<PromiseReturn> => {
        try {  
            const getUnreadNotification = await TaskRepo.getUnreadNotification(userId,page,pageSize);
            return { status: StatusCode.OK as number, message: "Task Fetched By Id Successfully." ,UnreadNotification:getUnreadNotification};
        }catch (error) {
                console.error("Error during getting notification:", error);
                return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
            }
    };


    getHistory = async (taskId:number,page: number = 1, pageSize: number = 10): Promise<PromiseReturn> => {
        try {  
            const existingTask = await TaskRepo.findTaskById(taskId);
            if (!existingTask) {
                return { status: StatusCode.NotFound as number, message: "Task not found." };
            }
            const getHistory = await TaskRepo.getHistory(taskId,page,pageSize);
            if(!getHistory){
                return {status: StatusCode.NotFound as number,message: "There is no history for this task",};
            }
            return { status: StatusCode.OK as number, message: "Task Fetched By Id Successfully." ,taskHistory:getHistory};
        }catch (error) {
                console.error("Error during getting history:", error);
                return { status: StatusCode.InternalServerError as number, message: "Internal server error." };
            }
    };


    NotificationSending = async (
        message: string,
        task: Task,
        assignedUser: User,
        recipientId: number,
        contributes?: number[],
        contributorsMessage?: string
    ): Promise<Notification[] | null> => {
        try {
            // Collect notifications to be saved in bulk
            const notificationsToSave: Notification[] = [];
    
            // Add notification for the primary recipient if it doesn't exist
            const existingNotification = await TaskRepo.getExistingNotification(message, task.id, recipientId);
            if (!existingNotification) {
                const primaryNotification = new Notification();
                primaryNotification.message = message;
                primaryNotification.isRead = false;
                primaryNotification.recipientId = recipientId;
                notificationsToSave.push(primaryNotification);
    
                // Send FCM notification to the primary recipient
                await this.sendFcmNotificationToMultipleDevices(recipientId, message);
            } else {
                console.log("Notification already exists for primary recipient:", message);
            }
    
            // Process contributor notifications if any
            if (contributes && contributes.length > 0) {
                // Fetch all existing notifications for contributors in a single query
                const existingContributorNotifications = await TaskRepo.getNotificationsForContributors(message, task.id, contributes);
    
                // Get the contributor IDs who already have notifications
                const notifiedContributorIds = new Set(existingContributorNotifications.map(notif => notif.recipientId));
    
                // Filter contributors to only those without notifications
                const contributorsWithoutNotification = contributes.filter(id => !notifiedContributorIds.has(id));
    
                // Create notifications for contributors without existing notifications
                for (const contributorId of contributorsWithoutNotification) {
                    const contributorNotification = new Notification();
                    contributorNotification.message = contributorsMessage || message;
                    contributorNotification.isRead = false;
                    contributorNotification.recipientId = contributorId;
                    notificationsToSave.push(contributorNotification);
    
                    // Send FCM notification to each contributor without an existing notification
                    await this.sendFcmNotificationToMultipleDevices(contributorId, contributorsMessage || message);
                }
            }
    
            // Save all notifications in bulk if there are any new notifications
            if (notificationsToSave.length > 0) {
                const savedNotifications = await TaskRepo.saveBatchNotification(notificationsToSave);
                return savedNotifications;
            } else {
                console.log("No new notifications to save.");
                return null;
            }
        } catch (error) {
            console.error("Error during notification sending:", error);
            throw new Error("Failed to save notifications");
        }
    };
    
    
    


    TaskHistoryLogging = async (task: Task, action: string, details: string, loggedUserId: number): Promise<TaskHistory> => {
        try {
            
            // Check if task exists
            if (!task || !task.id) {
                throw new Error("Task not found or invalid task ID");
            }
            
            // Create new task history instance
            const taskHistory = new TaskHistory();
            taskHistory.taskId = task.id; // Set the task ID
            taskHistory.userId = loggedUserId; // Set the user ID
            taskHistory.action = action; // Action performed
            taskHistory.details = details; // Details about the action
        
            // Save the task history in the database using the correct repository
            const savedHistory = await TaskRepo.saveTaskHistory(taskHistory); // Make sure you are using the TaskHistoryRepo
            console.log("Task history saved successfully:", savedHistory);
    
            return savedHistory;
        } catch (error) {
            console.error("Error during task history logging:", error);
            throw new Error("Failed to save task history");
        }
    };


    createComment = async (commentData: TaskCommentData,loggedUserId?:number,roles?:string[]): Promise<PromiseReturn> => {
        try {
            const existingTask = await TaskRepo.findTaskById(commentData.taskId);
            if (!existingTask) {
                return { status: StatusCode.NotFound as number, message: "Task not found." };
            }
            
            const hasAccess = 
            existingTask.assigned_to === loggedUserId || 
            existingTask.created_by === loggedUserId || 
            roles?.some(role => [RoleName.ADMIN, RoleName.MANAGEMENT].includes(role as RoleName))||
            (roles?.includes(RoleName.TO) && existingTask.assignedTo.team.toUserId === loggedUserId)

            if (!hasAccess) {
                return { 
                    status: StatusCode.Unauthorized as number, 
                    message: `You do not have permission to comment on this task: ${existingTask.title}.` 
                };
            }

            const existingUser: User = await UserRepo.getUserById(commentData.userId);

            if (!existingUser) return { status: StatusCode.NotFound as number, message: "Comment Added User Not Found" };
            const comment = new TaskComment();
            Object.assign(comment, commentData); 

            const savedComment = await TaskRepo.createComment(comment); 
            await this.TaskHistoryLogging(existingTask,TaskHistoryAction.TASK_COMMENT_ADDED,`the task have a  new comment on: ${existingTask.title} by ${existingUser.name}`,loggedUserId)
            return { status: StatusCode.Created as number, message: 'Comment added successfully', taskComent: savedComment };
        } catch (error) {
            console.error("Error when creating comment:", error);
            throw error;
        }
    };


    updateComment = async (commentData: TaskCommentData, loggedUserId?: number, roles?: string[]): Promise<PromiseReturn> => {
        try {
            // Fetch comment with task in a single query
            const existingComment = await TaskRepo.findCommentById(commentData.commentId);
            if (!existingComment || !existingComment.task) {
                return { status: StatusCode.NotFound as number, message: "Comment or Task not found." };
            }
    
            const hasAccess = existingComment.userId === loggedUserId
            if (!hasAccess) {
                return { 
                    status: StatusCode.Unauthorized as number, 
                    message: `You do not have permission to update comment on task: ${existingComment.task.title}.` 
                };
            }
    
            const existingUser: User = await UserRepo.getUserById(commentData.userId);
            if (!existingUser) {
                return { status: StatusCode.NotFound as number, message: "Comment user not found." };
            }
            // Update the comment (partial update)
            Object.assign(existingComment, commentData);
            const savedComment = await TaskRepo.createComment(existingComment);
            return { 
                status: StatusCode.OK as number, 
                message: 'Comment updated successfully', 
                taskComent: savedComment 
            };
        } catch (error) {
            console.error("Error when updating comment:", error);
            throw error;
        }
    };

    
    getComment=async(
        taskId: number,
        loggedUserId?: number,
        roles?: string[],
        page: number = 1,
        pageSize: number = 10
    ): Promise<PromiseReturn>=> {
        try {
            const existingTask = await TaskRepo.findTaskById(taskId);
            if (!existingTask) {
                return { status: StatusCode.NotFound as number, message: "Task doesn't exist." };
            }
    
            const hasAccess = 
                existingTask.assigned_to === loggedUserId || 
                existingTask.created_by === loggedUserId || 
                roles?.some(role => [RoleName.ADMIN, RoleName.MANAGEMENT].includes(role as RoleName)) ||
                (roles?.includes(RoleName.TO) && existingTask.assignedTo.team.toUserId === loggedUserId);
    
            if (!hasAccess) {
                return { 
                    status: StatusCode.Unauthorized as number, 
                    message: `You do not have permission to get comments on task: ${taskId}.` 
                };
            }
    
            // Use the new repository method to fetch comments with pagination
            const [comments, totalCount] = await TaskRepo.findCommentsWithPagination(taskId, page, pageSize);
    
            return { 
                status: StatusCode.OK as number, 
                message: 'Comments fetched successfully', 
                TaskComment: comments,
                totalCount // Total count of comments for the task
            };
        } catch (error) {
            console.error("Error when fetching comments:", error);
            throw error;
        }
    }
    

    deleteComment = async (commentId: number,loggedUserId?:number): Promise<PromiseReturn> => {
        try {
            const existingComment = await TaskRepo.findCommentById(commentId);
            if (!existingComment) {
                return { status: StatusCode.NotFound as number, message: "comment doesn't exist." };
            }
            
            const hasAccess = existingComment.userId === loggedUserId 

            if (!hasAccess) {
                return { 
                    status: StatusCode.Unauthorized as number, 
                    message: `You do not have permission to delete comment: ${commentId}.` 
                };
            }
            await TaskRepo.deleteComment(commentId); 
            return { status: StatusCode.Created as number, message: 'Comment deleted successfully' };
        } catch (error) {
            console.error("Error when creating comment:", error);
            throw error;
        }
    };

    getFilteredAndSortedTasks = async (
        filterOptions?: FilterOptions,
        page: number = 1,
        pageSize: number = 10
    ): Promise<PromiseReturn > => {
        try {
            if (!filterOptions) {
                return { status: StatusCode.NotFound as number, message: "Filter options not provided." };
            }
    
            // Fetch filtered tasks with pagination
            const {filterTask,totalFilterTask} = await TaskRepo.getFilteredAndSortedTasks(filterOptions, page, pageSize);
    
            if (filterTask.length === 0) {
                return { status: StatusCode.NotFound as number, message: "No tasks found matching the filters." };
            }
    
            // Fetch all assigned users (To and By), team owners, and related entities (brands, inventory, event)
            const [assignedToUsers, totalAssignedToUsers] = await TaskRepo.findAllAssignedToUsers(page, pageSize);
            const [assignedByUsers, totalAssignedByUsers] = await TaskRepo.findAllAssignedByUsers(page, pageSize);
            const { teams, totalTeamOwners } = await UserRepo.getAllTeam(page, pageSize);
            const { brands, totalBrand } = await UserRepo.getAllBrand(page, pageSize);
            const {events, totalEvents} = await UserRepo.getAllEvent(page, pageSize);
            const {inventory, totalInventory} = await UserRepo.getAllInventory(page, pageSize);
            
            
            // Marking users, team owners, brands, inventory, and events as viewable based on the filtered tasks
            const markedAssignedToUsers = assignedToUsers.map(user => {
                const count = filterTask.filter(task => task.assigned_to === user.id).length;
                return {
                    ...user,
                    viewable: count > 0, // true if matched
                    count: count // Number of matches
                };
            });
            
            const markedAssignedByUsers = assignedByUsers.map(user => {
                const count = filterTask.filter(task => task.created_by === user.id).length;
                return {
                    ...user,
                    viewable: count > 0, // true if matched
                    count: count // Number of matches
                };
            });
            
            const markedTeamOwners = teams.map(owner => {
                const count = filterTask.filter(task => task?.assignedTo?.teamId === owner.id).length;
                return {
                    teamOwner: owner.teamOwner,
                    viewable: count > 0, // true if matched
                    count: count // Number of matches
                };
            });
            
            const markedBrands = brands.map(brand => {
                const count = filterTask.filter(task => task.brand_id === brand.id).length;
                return {
                    ...brand,
                    viewable: count > 0, // true if matched
                    count: count // Number of matches
                };
            });
            
            const markedInventory = inventory.map(item => {
                const count = filterTask.filter(task => task.inventoryId === item.id).length;
                return {
                    ...item,
                    viewable: count > 0, // true if matched
                    count: count // Number of matches
                };
            });
            
            const markedEvents = events.map(event => {
                const count = filterTask.filter(task => task.eventId === event.id).length;
                return {
                    ...event,
                    viewable: count > 0, // true if matched
                    count: count // Number of matches
                };
            });
            
            // Returning the final object with all the relevant data and viewable flags
            return {
                status: StatusCode.Created as number,
                message: 'Filtered tasks successfully retrieved.',
                task: filterTask,
                totalFilterTask,
                assignedToUsers: markedAssignedToUsers,
                assignedByUsers: markedAssignedByUsers,
                teamOwners: markedTeamOwners,
                brand: markedBrands,
                Inventory: markedInventory,
                Event: markedEvents,
                pagination: {
                    page,
                    pageSize,
                    totalAssignedToUsers,
                    totalAssignedByUsers,
                    totalTeamOwners,
                    totalBrand,
                    totalInventory,
                    totalEvents
                }
            };
        } catch (error) {
            console.error("Error when fetching tasks:", error);
            throw error;
        }
    };

    getAnalytics=async(filter: string): Promise<PromiseReturn> =>{
        const now = new Date();
        const { startDate, endDate, previousStartDate, previousEndDate } = getDateRanges(filter, now);
    
        // Fetching the data for the current period
        const totalTasksCreated = await TaskRepo.countTasksCreated(startDate, endDate);
        const openTasks = await TaskRepo.countOpenTasks(startDate, endDate);
        const completedTasks = await TaskRepo.countCompletedTasks(startDate, endDate);
        const overdueTasks = await TaskRepo.countOverdueTasks(now);
    
        // Fetching the data for the previous period for comparison
        const totalTasksCreatedPrevious = await TaskRepo.countTasksCreated(previousStartDate, previousEndDate);
        const openTasksPrevious = await TaskRepo.countOpenTasks(previousStartDate, previousEndDate);
        const completedTasksPrevious = await TaskRepo.countCompletedTasks(previousStartDate, previousEndDate);
        const overdueTasksPrevious = await TaskRepo.countOverdueTasks(previousEndDate); // Using now for overdue tasks
    
        // Constructing comparison strings
        const totalTasksComparison = totalTasksCreated - totalTasksCreatedPrevious;
        const openTasksComparison = openTasks - openTasksPrevious;
        const completedTasksComparison = completedTasks - completedTasksPrevious;
        const overdueTasksComparison = overdueTasks - overdueTasksPrevious;
    
        return {
            message: "Analytics fetched successfully",
            status: 200,
            analytics: {
                [filter]: {
                    totalTasksCreated,
                    openTasks,
                    completedTasks,
                    overdueTasks,
                    comparison: {
                        totalTasksCreated: `Total Tasks Created: ${totalTasksComparison >= 0 ? '+' : ''}${totalTasksComparison} compared to previous period`,
                        openTasks: `Open Tasks: ${openTasksComparison >= 0 ? '+' : ''}${openTasksComparison} compared to previous period`,
                        completedTasks: `Completed Tasks: ${completedTasksComparison >= 0 ? '+' : ''}${completedTasksComparison} compared to previous period`,
                        overdueTasks: `Overdue Tasks: ${overdueTasksComparison >= 0 ? '+' : ''}${overdueTasksComparison} compared to previous period`,
                    },
                },
            },
        };
    };

    removeContributes=async(removeContributesData: RemoveContributes, loggedUserId: number): Promise<PromiseReturn> =>{
        try {
            // Check if the task exists
            const existingTask = await TaskRepo.findTaskById(removeContributesData.taskId);
            if (!existingTask) {
                return { status: StatusCode.NotFound as number, message: "Task not found." }; // Not Found status
            }
            console.log(existingTask,loggedUserId);
            
            // Permission check
            const hasPermission = existingTask.created_by === loggedUserId;
            if (!hasPermission) {
                return {
                    status: StatusCode.Unauthorized as number, // Unauthorized status
                    message: "You don't have permission to update this task.",
                };
            }
    
            const { userId, taskId } = removeContributesData;
    
            // Attempt to remove contribution
            const result = await TaskRepo.removeContribution(userId, taskId);
            return result
    
        } catch (error) {
            console.error("Error removing contribution:", error);
            return {
                status: StatusCode.InternalServerError as number, // Internal Server Error status
                message: "An error occurred while removing the contribution.",
            };
        }
    }

    addOrUpdateFcmToken=async(FcmData: FcmData): Promise<PromiseReturn> => {
        const { userId, fcmToken } = FcmData;

        try {
            // Save or update the FCM token using the repository
            const data = await TaskRepo.saveToken(userId, fcmToken);

            // Return a success response
            return {
                status: StatusCode.OK as number,
                message: 'FCM token added or updated successfully.',
                data: data.fcmToken,  // Returning the token object for further use if necessary
            };
        } catch (error) {
            console.error("Error adding or updating FCM token:", error);
            return {
                status: StatusCode.InternalServerError as number, // Internal Server Error status
                message: "An error occurred while adding or updating the FCM token.",
            };
        }
    }
    
    sendFcmNotificationToMultipleDevices = async (userId: number, message: string): Promise<void> => {
        try {
            // Fetch all FCM tokens for the given user
            const fcmTokens = await TaskRepo.getFcmTokens(userId);
    
            if (fcmTokens.length > 0) {
                // Prepare the message payload for multiple devices
                const messagePayload = {
                    notification: {
                        title: 'New Notification',
                        body: message,
                    },
                    tokens: fcmTokens,  // Send to all devices that have the token
                };
    
                // Send the notification
                const response = await admin.messaging().sendMulticast(messagePayload);
                console.log('Successfully sent multicast message:', response);
            } else {
                console.log('No FCM tokens found for user:', userId);
            }
        } catch (error) {
            console.error('Error sending multicast message:', error);
        }
    };
    
    
    
    
    
    
   
    
}