import * as vscode from 'vscode';
import { EnvDoctorController } from './vscode/controller';

let controller: EnvDoctorController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  controller = new EnvDoctorController(context);
  context.subscriptions.push(controller);
  await controller.activate();
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}