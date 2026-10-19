import { doors } from './sceneConfig';

export const workProjects = doors.filter((door) => door.group === 'work')
  .map(({ id, title, path }) => ({ id, title, path }));
