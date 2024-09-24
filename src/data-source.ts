import "reflect-metadata"
import { DataSource } from "typeorm"
import { Node } from "./entity/org-tree"

export const AppDataSource = new DataSource({
    type: "mysql",
    host: "localhost",
    port: 3306,
    username: "root",
    password: "Rashi@123",
    database: "user",
    synchronize: true,
    logging: false,
    entities: [Node],
    migrations: [],
    subscribers: [],
})
