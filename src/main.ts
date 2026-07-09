import type PipeBomb from "@sdk";
import { Trawler } from "./trawler.js";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { LidarrExternalUrlSource } from "./lidarr.external-url-soure.js";
import { WebhookServer } from "./webhook-server.js";
import type LocalLibraryPlugin from "local-library/src/main.js";

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

		this.api.registerTask({
			id: "sync",
			resumable: false,
			run: async (ctx) => trawler.sync((percent) => ctx.update(percent)),
		});

		let webhookServer: WebhookServer | null = null;
		const createWebhookServer = () => {
			webhookServer?.destroy();

			const port = config.getWebhookPort();
			if (port) {
				webhookServer = new WebhookServer(port, config, this.logger, () =>
					this.api
						.getPlugin<LocalLibraryPlugin>("local-library")
						.then((plugin) => plugin?.getLibrary() ?? null),
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
