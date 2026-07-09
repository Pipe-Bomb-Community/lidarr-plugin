import { Logger } from "@sdk";
import * as HTTP from "http";
import { LidarrWebhookPayload } from "./lidarr.js";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { LocalLibrary } from "local-library/src/local.library-handler.js";

interface WebhookAlbum {
	id: number;
	title: string;
}

interface WebhookEvent {
	artist: {
		id: number;
		name: string;
		path: string;
		mbId: string;
		tags: string[];
	};
	albums: WebhookAlbum[];
	eventType: string;
	instanceName: string;
	applicationUrl: string;
}

export class WebhookServer {
	private readonly app: HTTP.Server;

	constructor(
		port: number,
		config: LidarrConfigManager,
		logger: Logger,
		getLocalLibrary: () => Promise<LocalLibrary | null>,
	) {
		this.app = HTTP.createServer((req, res) => {
			if (req.url == "/" && req.method == "GET") {
				res.setHeader("Content-Type", "text/html");
				res.end("Pipe Bomb Lidarr webhook server");
				return;
			}

			if (req.method != "POST" && req.method != "PUT") {
				res.end("Method Not Allowed");
				return;
			}

			let body = "";
			req.on("data", (chunk: Buffer) => (body += chunk.toString("utf-8")));

			req.on("end", async () => {
				try {
					console.log(
						{
							method: req.method,
							url: req.url,
						},
						body,
					);
					const event: LidarrWebhookPayload = JSON.parse(body);
					const lidarrRootFolder = config.getRootFolderPath();
					if (!lidarrRootFolder) {
						logger.error(
							"Unable to automatically import tracks because root folder isn't set",
						);
						res.end();
						return;
					}
					if (event.eventType == "Download") {
						const filePaths: string[] = [];

						for (const trackFile of event.trackFiles) {
							if (!trackFile.path.startsWith(lidarrRootFolder)) {
								logger.warn(
									`Unable to automatically import track "${trackFile.path}" because it exists outside of root folder`,
								);
								continue;
							}
							const filePath = trackFile.path.substring(
								lidarrRootFolder.length,
							);
							filePaths.push(filePath);
							console.log(trackFile, filePath);
						}

						const library = await getLocalLibrary();
						if (!library) {
							logger.error(
								"Unable to automatically import tracks because Local Library isn't set up",
							);
							res.end();
							return;
						}

						logger.log(`Importing ${filePaths.length} new tracks:`);
						for (const filePath of filePaths) {
							logger.log(`- ${filePath}`);
						}

						for (const filePath of filePaths) {
							try {
								await library.scanTrackPath(filePath);
							} catch (e) {
								logger.error(`Failed to import track "${filePath}"`, e);
							}
						}
					}

					res.end();
				} catch (e) {
					logger.error("Failed to handle webhook event", e);
					res.writeHead(500);
					res.end("Server error");
				}
			});
		});

		this.app.listen(port, () => {
			logger.debug(`Started webhook server on port ${port}`);
		});
	}

	destroy() {
		this.app.close();
	}
}
