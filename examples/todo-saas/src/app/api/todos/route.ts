import { createTodo } from '../../../todos/service';

export async function POST() {
  return createTodo('New task');
}
