import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    ManyToOne,
    BeforeInsert,
    BeforeUpdate,
    Index,
    JoinColumn
} from 'typeorm';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { BrandOwnership } from './BrandOwnership';
import { RoleName } from '../interfaces/interface';
import { Team } from './Team'; // Import the Team entity
import { Task } from './Task';
import { TaskComment } from './TaskComment';
import { Notification } from './Notification';
import { TaskHistory } from './TaskHistory';
import { Contributes } from './Contributes';
import { FcmToken } from './FcmToken';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsNotEmpty({ message: 'Name should not be empty.' })
    name: string;

    @Column()
    @IsNotEmpty({ message: 'Department should not be empty.' })
    department: string;

    @Column({ name: 'phone_number' })
    phoneNumber: string;

    @Column({ unique: true })
    @IsEmail({}, { message: 'Email is not valid.' })
    email: string;

    @Column()
    password: string;

    @Column({ name: 'createdAt', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column('simple-array', { nullable: true })
    roles: RoleName[];

    @Column({ name: 'parentId', nullable: true })
    parentId: number;

    @ManyToOne(() => User, user => user.children, { nullable: true, onDelete: 'SET NULL' })
    @Index()
    parent: User;

    @OneToMany(() => User, user => user.parent)
    children: User[];

    @OneToMany(() => BrandOwnership, brandOwnership => brandOwnership.boUser)
    brandOwnerships: BrandOwnership[];

    @Column({ name: 'team_id', nullable: true })
    teamId: number; // This will store the team ID

    @ManyToOne(() => Team, team => team.users, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'team_id' }) // This specifies the foreign key column in the User table
    team: Team;

    @OneToMany(() => Team, team => team.teamOwner) // Relation to owned teams
    userTeams: Team[]; // Teams owned by this user

    @OneToMany(() => Task, task => task.assignedTo)
    assignedTasks: Task[];

    @OneToMany(() => Task, task => task.createdBy)
    createdTasks: Task[];

    @OneToMany(() => TaskComment, comment => comment.user, { cascade: true })
    comments: TaskComment[];

    @OneToMany(() => Notification, notification => notification.recipient)
    notifications: Notification[];

    @OneToMany(() => TaskHistory, (taskHistory) => taskHistory.user)
    taskHistories: TaskHistory[]; // User's task history records

    @OneToMany(() => Contributes, contributes => contributes.user, { cascade: true })
    contributions: Contributes[];

    @OneToMany(() => FcmToken, fcmToken => fcmToken.user)
    fcmTokens: FcmToken[]; // Array of FCM tokens associated with this user
}
