import { Brand } from "../entity/Brand";
import { Team } from "../entity/Team";
import { User } from "../entity/User";

export interface PromiseReturn{
    status: number; 
    User?:User
    user?:User[]
    message?:string
    token?:string
    team?:Team[]
    brand?:Brand[]
    Brand?:Brand

}
export enum Department {
    DEVELOPMENT = 'Development',
    DESIGN = 'Design',
    HR = 'HR'
}

export enum RoleName {
    ADMIN = 'ADMIN',
    PO = 'PO',
    BO = 'BO',
    TO = 'TO',
}

export interface UserData {
    name: string;
    department: Department; 
    phoneNumber: string;
    email: string;
    password: string;  
    roles: RoleName[]; 
    teamId?: number;
    parentId:number;

}
export interface BrandData {
    id:number
    brandName: string;        
    revenue: number;         
    dealClosedValue: number;  

}
export interface updatingUserData {
    id:number
    name: string;
    department: Department; 
    phoneNumber: string;
    email: string;
    password: string;  
    roles: RoleName[]; 
    teamId?: number;
    parentId:number;

}
export interface UserLoginData {
    email: string;
    password: string;  
}

