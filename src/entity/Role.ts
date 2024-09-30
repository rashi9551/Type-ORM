// src/entities/Role.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity()
export class Role {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'role_name', type: 'enum', enum: ['ADMIN', 'PO', 'BO', 'TO'] })
    roleName: 'ADMIN' | 'PO' | 'BO' | 'TO';

    @ManyToOne(() => User, user => user.roles, { onDelete: 'CASCADE' }) // Optional: cascade on delete
    @JoinColumn({ name: 'user_id' }) // Optional: specify the foreign key column name
    user: User;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}
