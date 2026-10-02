import { SessionUser } from '../auth/session.model';
import { CreateProjectDto, CreateTaskDto, UpdateProjectDto, UpdateTaskDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';
export declare class ProjectsController {
    private readonly projects;
    constructor(projects: ProjectsService);
    list(user: SessionUser): import(".prisma/client").Prisma.PrismaPromise<({
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
    get(user: SessionUser, id: number): Promise<{
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
    create(user: SessionUser, body: CreateProjectDto): import(".prisma/client").Prisma.Prisma__ProjectClient<{
        name: string;
        id: number;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        ownerId: number;
    }, never, import(".prisma/client/runtime/library").DefaultArgs>;
    update(user: SessionUser, id: number, body: UpdateProjectDto): Promise<{
        name: string;
        id: number;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        ownerId: number;
    }>;
    remove(user: SessionUser, id: number): Promise<void>;
    addTask(user: SessionUser, id: number, body: CreateTaskDto): Promise<{
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
    updateTask(user: SessionUser, taskId: number, body: UpdateTaskDto): Promise<{
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
    removeTask(user: SessionUser, taskId: number): Promise<void>;
}
