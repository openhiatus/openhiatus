/** Compatibility entry point for task scheduling and resource admission. */
export { JobManager, addUsage, resourcesConflict } from './modules/tasks';
export type { JobRequest, JobDependencies } from './modules/tasks';
