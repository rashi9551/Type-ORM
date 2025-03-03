import { DeepPartial, In, LessThan, Like, MoreThanOrEqual, Repository } from 'typeorm';
import { AppDataSource } from '../../data-source';
import { User } from '../../entity/User';
import { Team } from '../../entity/Team';
import { Brand } from '../../entity/Brand';
import { GetAllUser, BrandContactData, BrandData, BrandOwnershipData, RoleName, UserData, TaskData, TaskCommentData, FilterOptions, PromiseReturn } from '../../interfaces/interface';
import { BrandContact } from '../../entity/BrandContact';
import { BrandOwnership } from '../../entity/BrandOwnership';
import bcrypt from 'bcryptjs';
import { Task, TaskStatus } from '../../entity/Task';
import { StatusCode } from '../../interfaces/enum';
import UserRepo from './UserRepo'
import { Notification } from '../../entity/Notification';
import { TaskHistory } from '../../entity/TaskHistory';
import { TaskComment } from '../../entity/TaskComment';
import { log } from 'console';
import { Contributes } from '../../entity/Contributes';
import { FcmToken } from '../../entity/FcmToken';

export default new class TaskRepo {

    private UserRepo: Repository<User>;
    private TaskRepo: Repository<Task>;
    private NotificationRepo: Repository<Notification>;
    private TaskHistoryRepo: Repository<TaskHistory>;
    private CommentRepo: Repository<TaskComment>;
    private ContributesRepo: Repository<Contributes>;
    private FcmTokenRepo: Repository<FcmToken>;

    constructor() {
        this.UserRepo = AppDataSource.getRepository(User);
        this.TaskRepo = AppDataSource.getRepository(Task);
        this.NotificationRepo = AppDataSource.getRepository(Notification);
        this.TaskHistoryRepo = AppDataSource.getRepository(TaskHistory);
        this.CommentRepo = AppDataSource.getRepository(TaskComment);
        this.ContributesRepo = AppDataSource.getRepository(Contributes);
        this.FcmTokenRepo = AppDataSource.getRepository(FcmToken);
    }

     // Existing method to find a user by ID
     async createTask(taskData: TaskData): Promise<Task | null> {
        try {
            const task=this.TaskRepo.create(taskData)
            const createdTask = await this.TaskRepo.save(task); // Save the task to the database
            return createdTask; // Return the created task
        } catch (error) {
            console.error("Error when creating task:", error);
            throw error; 
        }
    }
    async saveTask(task: Task): Promise<Task> {
        try {                        
            const savedTask = await this.TaskRepo.save(task); // Save the task to the database            
            return savedTask; // Return the saved task (whether new or updated)
        } catch (error) {
            console.error("Error saving task:'''", error);
            throw new Error("Failed to save task");
        }
    }
    async deleteTask(taskId: number): Promise<Task | number> {
        try {            
            const deleteTask = await this.TaskRepo.delete(taskId);
            if (deleteTask.affected === 0) {
                throw new Error('Task not found or already deleted');
            }            
            return taskId ;; // Return the saved task (whether new or updated)
        } catch (error) {
            console.error("Error saving task:", error);
            throw new Error("Failed to save task");
        }
    }
    async getAllTasks(isCompleted?: boolean, page?: number, pageSize?: number): Promise<{ tasks: Task[], totalCount: number }> {
        const statusCondition = isCompleted ? TaskStatus.Completed : TaskStatus.Pending;

        const [tasks, totalCount] = await this.TaskRepo.findAndCount({
            where: {status:statusCondition},
            skip: (page - 1) * pageSize, // Skip the number of tasks based on the current page
            take: pageSize, // Limit the number of tasks returned
            relations: [
                'contributions', // Add this line to include the contributes relation
                'contributions.user'
            ]
        });
        return { tasks, totalCount };
    }

    async getYourTask(userId: number, isComplete: boolean): Promise<Task[]> {
        try {
            const statusToCheck = isComplete ? TaskStatus.Completed : TaskStatus.Pending;
    
            return await this.TaskRepo.createQueryBuilder("task")
                .leftJoinAndSelect("task.assignedTo", "assignedTo") // Join with assigned user
                .leftJoinAndSelect("task.createdBy", "createdBy")   // Join with creator user
                .leftJoinAndSelect("task.brand", "brand")           // Join with brand
                .leftJoinAndSelect("task.inventory", "inventory")   // Join with inventory
                .leftJoinAndSelect("task.event", "event")           // Join with event
                .leftJoinAndSelect("task.contributes", "contributions") // Join with contributions
                .leftJoinAndSelect("contributions.user", "user") // Join with user in contributions
                .where("task.assigned_to = :userId", { userId })    // Match the assigned user
                .andWhere("task.status = :status", { status: statusToCheck }) // Match the task status based on isComplete
                .getMany(); // Fetch all matching tasks with relations
        } catch (error) {
            console.error("Error fetching user's tasks:", error);
            throw new Error("Failed to fetch tasks");
        }
    }
    
    
    async getDelegatedToOthersTask(
        created_by: number,
        isComplete: boolean,
        page: number = 1,
        pageSize: number = 10
    ): Promise<{ tasks: Task[]; totalCount: number }> {
        try {
            const statusCondition = isComplete ? TaskStatus.Completed : TaskStatus.Pending;
    
            const [tasks, totalCount] = await this.TaskRepo.createQueryBuilder("task")
                .leftJoinAndSelect("task.assignedTo", "assignedTo") // Join with assigned user
                .leftJoinAndSelect("task.createdBy", "createdBy") // Join with creator user
                .leftJoinAndSelect("task.brand", "brand") // Join with brand
                .leftJoinAndSelect("task.inventory", "inventory") // Join with inventory
                .leftJoinAndSelect("task.event", "event") // Join with event
                .leftJoinAndSelect("task.contributes", "contributions") // Join with contributions
                .leftJoinAndSelect("contributions.user", "user") // Join with user in contributions
                .where("task.created_by = :created_by", { created_by })
                .andWhere("task.status = :status", { status: statusCondition }) // Check completion status
                .skip((page - 1) * pageSize) // Pagination
                .take(pageSize) // Pagination
                .getManyAndCount(); // Get both tasks and count
    
            return { tasks, totalCount }; // Return both tasks and the total count
        } catch (error) {
            console.error("Error fetching delegated tasks:", error);
            throw new Error("Failed to fetch tasks");
        }
    }
    
    


    async getTeamTask(
        userId: number,
        isComplete: boolean,
        page: number = 1,
        pageSize: number = 10
    ): Promise<{ tasks: Task[]; totalCount: number }> {
        try {
            const user = await UserRepo.findUserById(userId);
    
            if (!user || !user.team) {
                throw new Error("admin can't have the team task");
            }
    
            const teamId = user.team.id; // Assuming the team has an 'id' field
            const statusCondition = isComplete ? TaskStatus.Completed : TaskStatus.Pending;
    
            const [tasks, totalCount] = await this.TaskRepo.createQueryBuilder("task")
                .leftJoinAndSelect("task.assignedTo", "assignedTo")
                .leftJoinAndSelect("task.createdBy", "createdBy")
                .leftJoinAndSelect("task.brand", "brand")
                .leftJoinAndSelect("task.inventory", "inventory")
                .leftJoinAndSelect("task.event", "event")
                .leftJoinAndSelect("task.contributes", "contributions") // Join with contributions
                .leftJoinAndSelect("contributions.user", "user") // Join with user in contributions
                .where("assignedTo.team_id = :teamId", { teamId }) // Replace with the correct foreign key name
                .andWhere("task.status = :status", { status: statusCondition }) // Check completion status
                .skip((page - 1) * pageSize) // Pagination
                .take(pageSize) // Pagination
                .getManyAndCount(); // Get both tasks and count
    
            return { tasks, totalCount }; // Return both tasks and the total count
        } catch (error) {
            if (error.message === "admin can't have the team task") {
                throw new Error("admin can't have the team task");
            }
            console.error("Error fetching team tasks:", error);
            throw new Error("Failed to fetch team tasks");
        }
    }
    
    
    async findTaskById(taskId: number): Promise<Task| null> {
        try {
            // Fetch the team ID of the user
            const taskById=await this.TaskRepo.findOne({
                where: { id: taskId },
                relations: [
                    'assignedTo', // Load the user the task is assigned to
                    'createdBy', // Load the user who created the task
                    'brand', // Load the brand related to the task, if any
                    'inventory', // Load the inventory related to the task, if any
                    'event', // Load the event related to the task, if any
                    'comments', // Load all comments on the task
                    'notifications', // Load all notifications related to the task
                    'history', // Load the task history records
                    'contributions', // Add this line to include the contributes relation
                    'contributions.user'
                ]
            });
            return taskById
        } catch (error) {
            console.error("Error fetching by id tasks:", error);
            throw new Error("Failed to fetch team tasks");
        }
    }
    async getUnreadNotification(userId: number, page: number = 1, pageSize: number = 10): Promise<Notification[] | null> {
        try {
            const unreadNotifications = await this.NotificationRepo.find({
                where: {
                    recipient: { id: userId }, // Filter by recipient ID (user)
                    isRead: false // Only fetch unread notifications
                },
                relations: ['recipient', 'task'], // Optionally load related entities like User and Task
                order: {
                    createdAt: 'DESC' // Sort by creation date if needed
                },
                skip: (page - 1) * pageSize, // Skip the records of previous pages
                take: pageSize // Limit the number of records fetched
            });
    
            if (unreadNotifications.length > 0) {
                const notificationIds = unreadNotifications.map(notification => notification.id); // Get the IDs of unread notifications
                
                // Update isRead to true for the unread notifications in a single query
                await this.NotificationRepo.createQueryBuilder()
                    .update(Notification)
                    .set({ isRead: true }) // Set isRead to true
                    .where("id IN (:...ids)", { ids: notificationIds }) // Use the collected IDs
                    .execute();
            }
            return unreadNotifications.length > 0 ? unreadNotifications : null;
        } catch (error) {
            console.error("Error fetching unread notifications:", error);
            throw new Error("Failed to fetch unread notifications");
        }
    }
    
    async getHistory(taskId: number, page: number = 1, pageSize: number = 10): Promise<TaskHistory[] | null> {
        try {
            // Fetch task history records related to the specified task ID with pagination
            const taskHistoryRecords = await this.TaskHistoryRepo.find({
                where: {
                    taskId: taskId, // Filter by task ID
                },
                relations: ['user', 'task'], // Optionally load related User entity
                order: {
                    createdAt: 'DESC', // Sort by creation date if needed
                },
                skip: (page - 1) * pageSize, // Skip the records of previous pages
                take: pageSize // Limit the number of records fetched
            });
    
            // Return the fetched task history records
            return taskHistoryRecords.length > 0 ? taskHistoryRecords : null;
        } catch (error) {
            console.error("Error fetching task history:", error);
            throw new Error("Failed to fetch task history");
        }
    }
    
    async getExistingNotification(message:string,taskId:number,recipientId:number): Promise<Notification | null> {
        try {
            const existingNotification = await this.NotificationRepo.findOne({
                where: {
                    recipientId:recipientId,
                    task: { id: taskId },
                    message: message,
                    isRead: false // You can add more conditions here if needed
                }
            });
            return existingNotification;
        } catch (error) {
            console.error("Error fetching unread notifications:", error);
            throw new Error("Failed to fetch unread notifications");
        }
    }
    

    async saveNotification(notificationData: Notification): Promise<Notification> {
        try {
            // Log notificationData before creating to ensure data is correct
            const notification = this.NotificationRepo.create(notificationData);
            const savedNotification = await this.NotificationRepo.save(notification);            
            return savedNotification;
        } catch (error) {
            console.error("Error saving notification:", error);
            throw new Error("Failed to save notification");
        }
    }

    async saveBatchNotification(notifications: Notification[]): Promise<Notification[]> {
        return await this.NotificationRepo.save(notifications);
    }
    async getNotificationsForContributors(
        message: string,
        taskId: number,
        contributorIds: number[]
    ): Promise<Notification[]> {
        return await this.NotificationRepo.find({
            where: {
                message: message,
                task: { id: taskId },
                recipientId: In(contributorIds)
            }
        });
    }
    async saveTaskHistory(taskHistory: TaskHistory): Promise<TaskHistory> {
        try {
            const savedTaskHistory = await this.TaskHistoryRepo.save(taskHistory); // Save the task history to the database
            return savedTaskHistory; // Return the saved task history entry
        } catch (error) {
            console.error("Error saving task history:", error);
            throw new Error("Failed to save task history");
        }
    }

    async createComment(commentData: DeepPartial<TaskCommentData>): Promise<TaskComment> {
        try {
            const comment = this.CommentRepo.create(commentData);
            return await this.CommentRepo.save(comment);
        } catch (error) {
            console.error("Error when saving comment:", error);
            throw error;
        }
    }
    async findCommentById(commentId: number): Promise<TaskComment | null> {
        try {
            const comment = await this.CommentRepo.findOne({
                where: { id: commentId },
                relations: ['task', 'user']  // Including related entities
            });
            
            return comment;
        } catch (error) {
            console.error("Error when finding comment by ID:", error);
            throw error;
        }
    }
    
    async deleteComment(commentId: number): Promise<string> {
        try {
            const result = await this.CommentRepo.delete(commentId);
            return `Comment with ID ${commentId} deleted successfully`;
        } catch (error) {
            console.error("Error when deleting comment:", error);
            throw error;
        }
    }

    async findCommentsWithPagination(taskId: number, page: number, pageSize: number): Promise<[TaskComment[], number]> {
        try {
            return await this.CommentRepo.findAndCount({
                where: { taskId },
                skip: (page - 1) * pageSize, // Skip the number of comments based on the current page
                take: pageSize, // Limit the number of comments returned
                order: { createdAt: 'DESC' } // Order comments by createdAt or any other field
            });
        } catch (error) {
            console.error("Error fetching comments with pagination:", error);
            throw new Error('Could not fetch comments.'); // You can throw a custom error or rethrow the original error
        }
    }
    

    async getFilteredAndSortedTasks(
        filters: FilterOptions,
        page: number = 1,
        pageSize: number = 10
    ): Promise<{ filterTask?: Task[]; totalFilterTask?: number }> {
        try {
            // Create the base query
            const query = this.TaskRepo.createQueryBuilder("task")
                .leftJoinAndSelect("task.assignedTo", "assignedTo")
                .leftJoinAndSelect("task.createdBy", "createdBy")
                .leftJoinAndSelect("task.brand", "brand")
                .leftJoinAndSelect("task.inventory", "inventory")
                .leftJoinAndSelect("task.event", "event");
    
            // Apply filters
            if (filters.type) {
                query.andWhere("task.type = :taskType", { taskType: filters.type });
            }
            if (filters.assignedBy) {
                query.andWhere("task.created_by = :assignedBy", { assignedBy: filters.assignedBy });
            }
            if (filters.assignedTo) {
                query.andWhere("task.assigned_to = :assignedTo", { assignedTo: filters.assignedTo });
            }
            if (filters.teamOwner) {
                query.andWhere("assignedTo.team_id = :teamOwner", { teamOwner: filters.teamOwner });
            }
            if (filters.dueDatePassed) {
                query.andWhere("task.due_date < NOW()"); // Assuming due_date is a field in Task
            }
            if (filters.brandName) {
                query.andWhere("brand.brandName LIKE :brandName", { brandName: `%${filters.brandName}%` });
            }
            if (filters.inventoryName) {
                query.andWhere("LOWER(TRIM(inventory.name)) LIKE LOWER(:inventoryName)", { inventoryName: `%${filters.inventoryName.trim().toLowerCase()}%` });
            }
            if (filters.eventName) {
                query.andWhere("event.name LIKE :eventName", { eventName: `%${filters.eventName}%` });
            }
            if (filters.status) {
                query.andWhere("task.status = :status", { status: filters.status });
            }
    
            // Get the total count of matching tasks
            const totalFilterTask = await query.getCount();
    
            // Apply sorting
            if (filters.sortBy) {
                const order = filters.sortOrder === 'DESC' ? 'DESC' : 'ASC';
                query.orderBy(`task.${filters.sortBy}`, order);
            }
    
            // Apply pagination
            query.skip((page - 1) * pageSize) // Skip the records of previous pages
                 .take(pageSize); // Limit the number of records fetched
    
            // Get the paginated tasks
            const filterTask = await query.getMany();
    
            // Return tasks and total count
            return { filterTask, totalFilterTask };
        } catch (error) {
            console.error('Error getting filtered and sorted tasks:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }

    async findAllAssignedToUsers(page: number = 1, pageSize: number = 10): Promise<[User[], number]> {
        try {
            // Query to find all distinct users who have been assigned tasks
            const [assignedUsers, total]: [User[], number] = await this.UserRepo.createQueryBuilder('user')
                .innerJoin('user.assignedTasks', 'task') // Inner join with tasks that the user is assigned to
                .distinct(true) // Ensure distinct users
                .skip((page - 1) * pageSize) // Apply pagination
                .take(pageSize) // Number of users to take
                .getManyAndCount(); // Get users and total count for pagination
    
            return [assignedUsers, total];
        } catch (error) {
            console.error("Error fetching assigned users:", error);
            throw new Error("Failed to fetch assigned users");
        }
    }
    async findAllAssignedByUsers(page: number = 1, pageSize: number = 10): Promise<[User[], number]> {
        try {
            // Query to find all distinct users who have created tasks
            const [AssignedByUsers, total]: [User[], number] = await this.UserRepo.createQueryBuilder('user')
                .innerJoin('user.createdTasks', 'task') // Join with tasks that the user has created
                .distinct(true) // Ensure distinct users
                .skip((page - 1) * pageSize) // Apply pagination
                .take(pageSize) // Number of users to take
                .getManyAndCount(); // Get users and total count for pagination
    
            return [AssignedByUsers, total];
        } catch (error) {
            console.error("Error fetching users who created tasks:", error);
            throw new Error("Failed to fetch users who created tasks");
        }
    }
    
    
    
    async findDueTasks(now: Date, twelveHoursFromNow: Date): Promise<Task[]> {
        try {
            return await this.TaskRepo.find({
                where: [
                    {
                        due_date: MoreThanOrEqual(now),
                    },
                    {
                        due_date: LessThan(twelveHoursFromNow),
                    },
                ],
                relations: ['assignedTo'], // Assuming assignedTo is a User entity
            });
        } catch (error) {
            console.error('Error finding due tasks:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    // Method to fetch all users
    async findAllUsers(): Promise<User[]> {
        try {
            return await this.UserRepo.find();
        } catch (error) {
            console.error('Error finding all users:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    async countTasksCreated(startDate: Date, endDate: Date): Promise<number> {
        try {
            return await this.TaskRepo.count({
                where: {
                    createdAt: MoreThanOrEqual(startDate),
                    due_date: LessThan(endDate),
                },
            });
        } catch (error) {
            console.error('Error counting tasks created:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    async countOpenTasks(startDate: Date, endDate: Date): Promise<number> {
        try {
            return await this.TaskRepo.count({
                where: {
                    createdAt: MoreThanOrEqual(startDate),
                    due_date: LessThan(endDate),
                    status: TaskStatus.Pending, // Adjusted to use the enum
                },
            });
        } catch (error) {
            console.error('Error counting open tasks:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    async countCompletedTasks(startDate: Date, endDate: Date): Promise<number> {
        try {
            return await this.TaskRepo.count({
                where: {
                    createdAt: MoreThanOrEqual(startDate),
                    due_date: LessThan(endDate),
                    status: TaskStatus.Completed, // Adjusted to use the enum
                },
            });
        } catch (error) {
            console.error('Error counting completed tasks:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    async countOverdueTasks(now: Date): Promise<number> {
        try {
            return await this.TaskRepo.count({
                where: {
                    due_date: LessThan(now),
                    status: TaskStatus.Pending, // Assuming you want overdue tasks that are still open
                },
            });
        } catch (error) {
            console.error('Error counting overdue tasks:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    async findAllTasks(): Promise<Task[]> {
        try {
            return await this.TaskRepo.find();
        } catch (error) {
            console.error('Error finding all tasks:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }
    
    async updateSLA(tasks: Task[]) {
        try {
            const taskIds = tasks.map(task => task.id);
            await this.TaskRepo.update(taskIds, { sla: true }); // Update SLA for the given task IDs
        } catch (error) {
            console.error('Error updating SLA:', error);
            throw error; // Optionally re-throw the error for further handling
        }
    }



    

    // Method to save contributes data in bulk with error handling
    async saveContributeData(contributeData: { userId: number; taskId: number }[]): Promise<void> {
        try {
            // Map the input data to Contribute entities
            const contributeEntities = contributeData.map(data => {
                const contribute = new Contributes();
                contribute.userId = data.userId;
                contribute.taskId = data.taskId;
                return contribute;
            });
    
            // Use ContributesRepo to bulk save all contributions
            await this.ContributesRepo.save(contributeEntities);
        } catch (error) {
            console.error("Error in saveContributeData:", error);
            throw new Error("Failed to save contribution data.");
        }
    }

    async findContributionsByTaskId(taskId: number): Promise<Contributes[]> {
        return await this.ContributesRepo.find({
            where: { taskId: taskId },
        });
    }


    async removeContribution(userId: number, taskId: number): Promise<PromiseReturn> {
        try {
            // Check if the contribution exists
            const contribution = await this.ContributesRepo.findOne({
                where: {
                    userId: userId,
                    taskId: taskId,
                },
            });

            if (!contribution) {
                return {
                    status: StatusCode.NotFound as number,
                    message: "Contribution not found.",
                };
            }

            // Remove the contribution
            await this.ContributesRepo.remove(contribution);

            return {
                status:StatusCode.OK as number,
                message: "Contribution removed successfully.",
            };
        } catch (error) {
            console.error("Error removing contribution:", error);
            return {
                status: 500,
                message: "Failed to remove contribution.",
            };
        }
    }


    async saveToken(userId: number, fcmToken: string): Promise<FcmToken> {
        try {
            // Create a new instance of the FcmToken entity
            const token = this.FcmTokenRepo.create({
                userId,      // User ID
                fcmToken,    // FCM Token
            });

            // Save the token (will update existing or create new)
            return await this.FcmTokenRepo.save(token) 
        } catch (error) {
            console.error('Error saving FCM token:', error);
            throw new Error('Error saving FCM token');
        }
    }
    

    async getFcmTokens(userId: number): Promise<string[]> {
        try {
            // Find FCM tokens for the given userId
            const tokens = await this.FcmTokenRepo.find({
                where: { userId },  // Filter by userId to get all tokens for that user
            });
    
            // Map the results to return an array of FCM tokens (strings)
            return tokens.map(token => token.fcmToken);
        } catch (error) {
            console.error('Error fetching FCM tokens:', error);
            throw new Error('Error fetching FCM tokens');
        }
    }
    
}