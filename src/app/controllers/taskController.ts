import {Response,Request} from 'express'
import { StatusCode } from '../../interfaces/enum'
import TaskUseCase from '../useCase/taskUseCase'
import { UserData, UserLoginData ,BrandData, TaskData, TaskType, TaskCommentData} from '../../interfaces/interface'

export default new class TaskController{

    createTask=async(req:Request,res:Response)=>{
        try {
            console.log("user creating  task...");
            const taskData:TaskData=req.body
            const createTaskResponse=await TaskUseCase.createTask(taskData)
            res.status(createTaskResponse.status).json(createTaskResponse)
        } catch (error) {
            console.log(error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error  ' }); 
        }
    }
    updateTask=async(req:Request,res:Response)=>{
        try {
            console.log("user creating  updating task...");
            const taskData:TaskData=req.body
            const updateTaskResponse=await TaskUseCase.updateTask(taskData,+req.id)
            res.status(updateTaskResponse.status).json(updateTaskResponse)
        } catch (error) {
            console.log(error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error  ' }); 
        }
    }
    getTasks=async(req:Request,res:Response)=>{
        try {
            console.log("user getting  tsaks...");
            console.log("loggedUser:",req.id);
            
            const filter:TaskType=req.body.filter
            const getTasksResponse=await TaskUseCase.getTasks(filter,req.id,req.role)
            res.status(getTasksResponse.status).json(getTasksResponse)
        } catch (error) {
            console.log(error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error  ' }); 
        }
    }
    getTask=async(req:Request,res:Response)=>{
        try {
            console.log("user getting  taskByID...");
            const taskId=req.params.id
            const getTasksResponse=await TaskUseCase.getTask(+taskId)
            res.status(getTasksResponse.status).json(getTasksResponse)
        } catch (error) {
            console.log(error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error  ' }); 
        }
    }
    getNotification=async(req:Request,res:Response)=>{
        try {
            console.log("user getting  notification...");
            const userId=req.params.id
            const getNotificationResponse=await TaskUseCase.getNotification(+userId)
            res.status(getNotificationResponse.status).json(getNotificationResponse)
        } catch (error) {
            console.log(error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error  ' }); 
        }
    }
    getHistory=async(req:Request,res:Response)=>{
        try {
            console.log("user getting  History...");
            const taskId=req.params.id
            const getHistoryResponse=await TaskUseCase.getHistory(+taskId)
            res.status(getHistoryResponse.status).json(getHistoryResponse)
        } catch (error) {
            console.log(error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error  ' }); 
        }
    }

    addComment = async (req: Request, res: Response) => {
        try {
            const commentData: TaskCommentData = {
                comment: req.body.commentText,             // Extract the comment text
                filePath: req.file ? req.file.path : null, // Extract the file path if available
                fileType: req.file ? req.file.mimetype : null, // Extract the file type if available
                taskId: req.body.taskId,                   // Extract the task ID from the request body
                userId: req.id,                        // Assuming user ID is set in req.user during token verification
            };
            const createCommentResponse = await TaskUseCase.createComment(commentData); // Call use case to save comment
            res.status(createCommentResponse.status).json(createCommentResponse);
        } catch (error) {
            console.error('Error adding comment:', error);
            return res.status(StatusCode.InternalServerError).json({ message: 'Internal Server Error' });
        }
    };
}