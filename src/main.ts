import type PipeBomb from "@sdk";
import { Trawler } from "./trawler.js";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { LidarrExternalUrlSource } from "./lidarr.external-url-soure.js";

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
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}
