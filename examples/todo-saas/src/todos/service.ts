import { saveTodo } from './repository';

export function createTodo(title: string) {
  return saveTodo({ id: String(Date.now()), title });
}
