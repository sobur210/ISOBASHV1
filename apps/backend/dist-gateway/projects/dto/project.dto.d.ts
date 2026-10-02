export declare class CreateProjectDto {
    name: string;
    description?: string;
}
export declare class UpdateProjectDto {
    name?: string;
    description?: string;
}
export declare class CreateTaskDto {
    title: string;
    description?: string;
}
export declare class UpdateTaskDto {
    title?: string;
    description?: string;
    status?: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'CANCELLED';
    result?: string;
}
