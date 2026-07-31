import { AlertCircle, LoaderCircle } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="state-message" role="status">
      <LoaderCircle className="spin" size={20} aria-hidden="true" />
      Loading model
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-message error-message" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
