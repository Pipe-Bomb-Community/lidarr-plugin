import type PipeBomb from "@pipe-bomb/plugin-sdk";
import { Trawler } from "./trawler.js";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { LidarrExternalUrlSource } from "./lidarr.external-url-soure.js";
import { WebhookServer } from "./webhook-server.js";
import type LocalLibraryPlugin from "local-library/src/main.js";
import { PauseImportsStep } from "./step/pause-imports.step.js";

export default class Plugin implements PipeBomb.Plugin {
	private api!: PipeBomb.PluginApiContext;
	private logger!: PipeBomb.Logger;

	enable(apiContext: PipeBomb.PluginApiContext) {
		this.api = apiContext;
		this.logger = apiContext.getLogger();

		this.api.registerLanguageDirectory("language");
		this.api.registerIconDirectory("icons");

		const config = new LidarrConfigManager();
		this.api.registerConfigManager(config);

		const trawler = new Trawler(this.api.getDataClient(), config, this.logger);

		this.api.registerExternalUrlSource(new LidarrExternalUrlSource(config));
		const workflowClient = this.api.getWorkflowClient();

		this.api.registerTask({
			id: "sync",
			resumable: false,
			run: async (ctx) => trawler.sync((percent) => ctx.update(percent)),
		});

		const pauseImportsStep = new PauseImportsStep();
		workflowClient.registerStep(pauseImportsStep.getStep());

		let webhookServer: WebhookServer | null = null;
		const createWebhookServer = () => {
			webhookServer?.destroy();

			const port = config.getWebhookPort();
			if (port) {
				webhookServer = new WebhookServer(
					port,
					config,
					this.logger,
					pauseImportsStep,
					async () => {
						const path = config.getRootFolderPath();
						if (path) {
							const plugin =
								await this.api.getPlugin<LocalLibraryPlugin>("local-library");
							const library = plugin
								?.getLibraries()
								?.find((lib) => lib.getPath() === path);
							if (library) {
								return library;
							}
						}

						return null;
					},
				);
			} else {
				webhookServer = null;
			}
		};
		createWebhookServer();
		config.addWebhookPortListener(() => createWebhookServer());
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}
