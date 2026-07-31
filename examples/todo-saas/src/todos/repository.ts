export interface Todo {
  id: string;
  title: string;
}

const todos: Todo[] = [];

export function saveTodo(todo: Todo): Todo {
  todos.push(todo);
  return todo;
}
