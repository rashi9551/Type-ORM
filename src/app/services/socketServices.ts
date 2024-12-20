// src/services/socketService.ts

import { Socket, Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

interface DecodedToken {
    userId: string;
}

interface AuthenticatedSocket extends Socket {
    decoded?: DecodedToken;
}

export class SocketService {
    private io: SocketIOServer | null = null;

    initialize(server: HttpServer): void {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: '*',  // Replace with your domain or client origin
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        this.io.use((socket: AuthenticatedSocket, next) => {
            const token: string | undefined = socket.handshake.query.token as string;

            if (!token) return next(new Error('Token missing'));

            jwt.verify(token, process.env.SECRET_KEY as string, (err, decoded) => {
                if (err) return next(new Error('Authentication error'));

                socket.decoded = decoded as DecodedToken;
                next();
            });
        });

        this.io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            socket.on('joinTaskRoom', (taskId: string) => {
                socket.join(taskId);
                console.log(`User ${socket.id} joined task room: ${taskId}`);
            });

            socket.on('sendComment', (comment: any) => {
                // Only parse if `comment` is a string
                const parsedComment = typeof comment === 'string' ? JSON.parse(comment) : comment;
                
                // Extract properties with updated structure
                const { taskId, userId, content, filePaths, id, createdAt } = parsedComment;
                
                if (taskId && userId && content) {
                    console.log(taskId,userId,content,"=-=-=-=-");
                    // Emit to other users in the same task room
                    this.io?.to(taskId).emit('receiveComment', {
                        userId,
                        content,
                        filePaths,
                        taskId,
                        id,
                        createdAt,
                    });
                    console.log(`Comment from user ${userId} in task ${taskId}: ${content}`);
                } else {
                    console.error('Invalid comment format:', parsedComment);
                }
            });
            
            

            socket.on('disconnect', () => {
                console.log('User disconnected:', socket.id);
            });
        });
    }
}

export default new SocketService();
