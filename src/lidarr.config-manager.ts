import { ConfigManager, ConfigManagerApiContext, ConfigNode } from "@sdk";
import { createClient, createConfig, createSdk, SDK } from "lidarr";

export class LidarrConfigManager implements ConfigManager {
	private api!: ConfigManagerApiContext;

	private url: string | null = null;
	private apiKey: string | null = null;
	private publicUrl: string | null = null;

	private sdk: typeof SDK | null = null;

	async enable(configManagerApiContext: ConfigManagerApiContext) {
		this.api = configManagerApiContext;

		this.url = await this.api.getValue("url", "string", false);
		this.publicUrl = await this.api.getValue("publicurl", "string", false);
		this.apiKey = await this.api.getValue("apikey", "string", false);
		this.updateSdk();
	}

	private updateSdk() {
		if (!this.url || !this.apiKey) {
			this.sdk = null;
			return;
		}

		this.sdk = createSdk(
			createClient(
				createConfig({
					baseUrl: this.url,
					headers: {
						"X-Api-Key": this.apiKey,
					},
				}),
			),
		);
	}

	getSdk() {
		return this.sdk;
	}

	getPublicUrl() {
		return this.publicUrl;
	}

	async getConfigOptions(): Promise<ConfigNode> {
		return {
			type: "section",
			children: [
				{
					type: "section",
					children: [
						{
							type: "heading",
							size: "md",
							content: "Server",
						},
						{
							type: "text",
							id: "url",
							placeholder: "http://127.0.0.1:8686",
							value: this.url ?? "",
							name: "Lidarr URL",
						},
						{
							type: "text",
							id: "apiKey",
							placeholder: "xxxxxxxxxxxxxxxxxxxx",
							value: this.apiKey ?? "",
							name: "Lidarr API Key",
						},
					],
				},
				{
					type: "section",
					children: [
						{
							type: "heading",
							size: "md",
							content: "Web",
						},
						{
							type: "text",
							id: "publicUrl",
							placeholder: "https://lidarr.pipebomb.net",
							value: this.publicUrl ?? "",
							name: "Lidarr Public URL",
						},
					],
				},
			],
		};
	}

	async update(values: Record<string, any>): Promise<ConfigNode> {
		const { url, publicUrl, apiKey } = values;

		if (typeof url == "string") {
			if (url.trim()) {
				this.url = url;
				await this.api.setValue("url", "string", url);
			} else {
				this.url = null;
				await this.api.delete("url");
			}
		}

		if (typeof publicUrl == "string") {
			if (publicUrl.trim()) {
				this.publicUrl = publicUrl;
				await this.api.setValue("publicurl", "string", publicUrl);
			} else {
				this.publicUrl = null;
				await this.api.delete("publicurl");
			}
		}

		if (typeof apiKey == "string") {
			if (apiKey.trim()) {
				this.apiKey = apiKey;
				await this.api.setValue("apikey", "string", apiKey);
			} else {
				this.apiKey = null;
				await this.api.delete("apikey");
			}
		}
		this.updateSdk();

		return this.getConfigOptions();
	}
}
