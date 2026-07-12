import { WorkflowStep } from "@sdk";

export class PauseImportsStep {
	private paused = false;
	private readonly listeners = new Set<() => void>();

	isPaused() {
		return this.paused;
	}

	addListener(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getStep(): WorkflowStep {
		return {
			type: "step",
			id: "pause-imports",
			getOptions: () => [
				{
					type: "boolean",
					id: "paused",
				},
			],
			run: async (ctx) => {
				const paused = !!ctx.getOption("paused", "boolean");
				if (this.paused != paused) {
					this.paused = paused;
					for (const listener of this.listeners) {
						listener();
					}
				}
			},
		};
	}
}
