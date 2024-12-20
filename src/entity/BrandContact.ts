import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Brand } from './Brand';

@Entity()
export class BrandContact {
    @PrimaryGeneratedColumn() // This will create an auto-incrementing integer ID
    id: number;

    @ManyToOne(() => Brand, brand => brand.contacts, { onDelete: 'CASCADE' })
    brand: Brand;

    @Column({ name: 'contact_person_name' })
    contactPersonName: string;

    @Column({ name: 'contact_person_phone' })
    contactPersonPhone: string;

    @Column({ name: 'contact_person_email' })
    contactPersonEmail: string;

    @Column({ name: 'createdAt', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}
