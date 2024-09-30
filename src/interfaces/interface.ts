import { User } from "../entity/User";

export interface PromiseReturn{
    status: number; 
    User?:User
    message?:string
    token?:string

}
export enum Department {
    DEVELOPMENT = 'Development',
    DESIGN = 'Design',
    HR = 'HR'
}

export interface UserData {
    name: string;
    department: Department; 
    phoneNumber: string;
    email: string;
    password: string;  
    roles: ('ADMIN' | 'PO' | 'BO' | 'TO')[]; 
    teamOwner?: number;

}
export interface UserLoginData {
    email: string;
    password: string;  
}

