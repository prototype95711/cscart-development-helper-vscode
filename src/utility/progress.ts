import * as vscode from 'vscode';

export interface IProgressOptions {
	readonly location: vscode.ProgressLocation | string;
	readonly title?: string;
	readonly source?: string | { label: string; id: string };
	readonly total?: number;
	readonly cancellable?: boolean;
	readonly buttons?: string[];
}

export interface IProgressNotificationOptions extends IProgressOptions {
	readonly location: vscode.ProgressLocation.Notification;
	readonly primaryActions?: readonly IAction[];
	readonly secondaryActions?: readonly IAction[];
	readonly delay?: number;
	readonly priority?: NotificationPriority;
	readonly type?: 'syncing' | 'loading';
}

export interface IProgressCompositeOptions extends IProgressOptions {
	readonly location: vscode.ProgressLocation.Window | string;
	readonly delay?: number;
}

export interface IAction {
	readonly id: string;
	label: string;
	tooltip: string;
	class: string | undefined;
	enabled: boolean;
	checked?: boolean;
	run(...args: unknown[]): unknown;
}

export enum NotificationPriority {

	/**
	 * Default priority: notification will be visible unless do not disturb mode is enabled.
	 */
	DEFAULT,

	/**
	 * Silent priority: notification will only be visible from the notifications center.
	 */
	SILENT,

	/**
	 * Urgent priority: notification will be visible even when do not disturb mode is enabled.
	 */
	URGENT
}
