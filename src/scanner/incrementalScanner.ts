import { WorkspaceScanner } from './workspaceScanner';

export class IncrementalScanner extends WorkspaceScanner {
  markChanged(filePath: string): void {
    this.invalidate(filePath);
  }
  reset(): void {
    this.invalidate();
  }
}
