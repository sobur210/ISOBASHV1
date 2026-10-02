import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, CreateTaskDto, UpdateProjectDto, UpdateTaskDto } from './dto/project.dto';
export declare class ProjectsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(userId: number): import(".prisma/client").Prisma.PrismaPromise<({
        tasks: {
            id: number;
            status: import(".prisma/client").$Enums.TaskStatus;
            createdAt: Date;
            result: string | null;
            title: string;
            description: string | null;
            updatedAt: Date;
            projectId: number;
            order: number;
            assigneeId: number | null;
            agentRunId: string | null;
        }[];
        _count: {
            agents: number;
            memories: number;
            conversations: number;
        };
    } & {
        name: string;
        id: number;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        ownerId: number;
    })[]>;
    get(userId: number, id: number): Promise<{
        tasks: {
            id: number;
            status: import(".prisma/client").$Enums.TaskStatus;
            createdAt: Date;
            result: string | null;
            title: string;
            description: string | null;
            updatedAt: Date;
            projectId: number;
            order: number;
            assigneeId: number | null;
            agentRunId: string | null;
        }[];
    } & {
        name: string;
        id: number;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        ownerId: number;
    }>;
    create(userId: number, input: CreateProjectDto): import(".prisma/client").Prisma.Prisma__ProjectClient<{
        name: string;
        id: number;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        ownerId: number;
    }, never, import(".prisma/client/runtime/library").DefaultArgs>;
    update(userId: number, id: number, input: UpdateProjectDto): Promise<{
        name: string;
        id: number;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        ownerId: number;
    }>;
    remove(userId: number, id: number): Promise<void>;
    addTask(userId: number, projectId: number, input: CreateTaskDto): Promise<{
        id: number;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        result: string | null;
        title: string;
        description: string | null;
        updatedAt: Date;
        projectId: number;
        order: number;
        assigneeId: number | null;
        agentRunId: string | null;
    }>;
    /** Task ownership is checked through the project, never from the client. */
    updateTask(userId: number, taskId: number, input: UpdateTaskDto): Promise<{
        id: number;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        result: string | null;
        title: string;
        description: string | null;
        updatedAt: Date;
        projectId: number;
        order: number;
        assigneeId: number | null;
        agentRunId: string | null;
    }>;
    removeTask(userId: number, taskId: number): Promise<void>;
    private ownedTask;
}
