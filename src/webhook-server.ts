import { Logger } from "@sdk";
import * as HTTP from "http";
import { LidarrWebhookPayload } from "./lidarr.js";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { LocalLibrary } from "local-library/src/local.library-handler.js";
import { PauseImportsStep } from "./step/pause-imports.step.js";

interface NewPathEntry {
	library: LocalLibrary;
	path: string;
}

export class WebhookServer {
	private readonly app: HTTP.Server;
	private pendingImports = new Set<NewPathEntry>();
	private isImporting = false;
	private rerunImport = false;
	private pauseImportsListener: () => void;

	constructor(
		port: number,
		config: LidarrConfigManager,
		private readonly logger: Logger,
		private readonly pauseImportsStep: PauseImportsStep,
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
						}

						const library = await getLocalLibrary();
						if (!library) {
							logger.error(
								"Unable to automatically import tracks because Local Library isn't set up",
							);
							res.end();
							return;
						}

						for (const path of filePaths) {
							this.pendingImports.add({
								library,
								path,
							});
						}

						await this.import();
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

		this.pauseImportsListener = this.pauseImportsStep.addListener(() => {
			if (!this.pauseImportsStep.isPaused()) {
				this.import();
			}
		});
	}

	destroy() {
		this.app.close();
		this.pauseImportsListener();
	}

	private async import() {
		if (this.isImporting) {
			this.logger.warn(
				"Cannot start import because other tracks are already importing",
			);
			return;
		}

		if (this.pauseImportsStep.isPaused()) {
			this.logger.debug("Delaying imports because new imports are paused");
			return;
		}

		this.isImporting = true;
		this.rerunImport = false;
		const map = new Map<LocalLibrary, Set<string>>();

		for (const entry of this.pendingImports) {
			const set = map.get(entry.library);
			if (set) {
				set.add(entry.path);
			} else {
				map.set(entry.library, new Set([entry.path]));
			}
		}

		this.pendingImports.clear();

		for (const [library, paths] of map) {
			this.logger.log(
				`Importing ${paths.size} new tracks into Library "${library.id}":`,
			);
			for (const path of paths) {
				this.logger.log(`- ${path}`);
			}

			for (const path of paths) {
				if (this.pauseImportsStep.isPaused()) {
					this.logger.log("Import interrupted because imports were paused");

					for (const [library, paths] of map) {
						for (const path of paths) {
							this.pendingImports.add({ library, path });
						}
					}

					this.isImporting = false;
					return;
				}

				try {
					await library.scanTrackPath(path);
				} catch (e) {
					this.logger.error(`Failed to import track "${path}"`, e);
				}
				paths.delete(path);
			}
		}

		if (this.rerunImport && !this.pauseImportsStep.isPaused()) {
			setImmediate(() => {
				this.isImporting = false;
				this.import();
			});
		} else {
			this.isImporting = false;
		}
	}
}
