import { DataClient, Logger } from "@sdk";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { AlbumResource } from "lidarr";

export class Trawler {
	constructor(
		private readonly dataClient: DataClient,
		private readonly config: LidarrConfigManager,
		private readonly logger: Logger,
	) {}

	async sync(onProgress: (percent: number) => void) {
		const sdk = this.config.getSdk();
		if (!sdk) {
			throw new Error("Lidarr URL or API Key is not configured");
		}

		const allArtistsResponse = await sdk.Artist.getApiV1Artist();
		if (allArtistsResponse.error) {
			throw allArtistsResponse.error;
		}
		const allArtists = allArtistsResponse.data!;

		const albums = new Map<string, AlbumResource>();

		for (let i = 0; i < allArtists.length; i++) {
			const albumResponse = await sdk.Album.getApiV1Album({
				query: {
					artistId: allArtists[i]!.id,
				},
			});
			if (albumResponse.data) {
				for (const album of albumResponse.data) {
					if (!album.foreignAlbumId) {
						this.logger.error(
							`Lidarr album "${album.id}" didn't have a foreign album ID`,
						);
						continue;
					}
					albums.set(album.foreignAlbumId, album);
				}
			}
			onProgress((i + 1) / allArtists.length / 2);
		}

		this.logger.log(
			`Located ${albums.size} albums across ${allArtists.length} artists`,
		);

		const total = await this.dataClient.getAlbumCount();

		let index = 0;
		await this.dataClient.forEachAlbum(async (albumUuid) => {
			if (!index++) {
				onProgress(0);
			}

			const identities = await this.dataClient.getAlbumIdentities(albumUuid);
			if (identities) {
				const releaseGroups = identities.filter(
					(identity) => identity.identityId == "musicbrainz_release_group_id",
				);
				for (const releaseGroupIdentity of releaseGroups) {
					const releaseGroup = releaseGroupIdentity.identity;
					const existingAlbum = albums.get(releaseGroup);
					if (existingAlbum && typeof existingAlbum.id == "number") {
						if (existingAlbum.monitored) {
							this.logger.debug(
								`Lidarr is already tracking album "${albumUuid}" (MBID ${releaseGroup}) (${existingAlbum.artist?.artistName ?? "Unknown Artist"} - ${existingAlbum.title ?? "Unknown Album"})`,
							);
							continue;
						}
						this.logger.log(
							`Lidarr is aware of album "${albumUuid}" (MBID ${releaseGroup}) but isn't monitoring it. Monitoring now... (${existingAlbum.artist?.artistName ?? "Unknown Artist"} - ${existingAlbum.title ?? "Unknown Album"})`,
						);

						await sdk.Album.putApiV1AlbumMonitor({
							body: { albumIds: [existingAlbum.id], monitored: true },
						});
						continue;
					}

					const lookupResponse = await sdk.AlbumLookup.getApiV1AlbumLookup({
						query: {
							term: `lidarr:${releaseGroup}`,
						},
					});

					if (lookupResponse.error) {
						this.logger.error(
							`Failed to lookup album "${albumUuid}" (MBID ${releaseGroup})`,
						);
						continue;
					}

					const album = lookupResponse.data?.[0];
					if (!album) {
						this.logger.error(
							`Lidarr failed to return album "${albumUuid}" (MBID ${releaseGroup})`,
						);
						continue;
					}

					this.logger.log(
						`Adding album "${albumUuid}" to Lidar (MBID ${releaseGroup}) (${album.artist?.artistName ?? "Unknown Artist"} - ${album.title ?? "Unknown Album"})`,
					);

					await sdk.Album.postApiV1Album({
						body: {
							...album,
							monitored: true,
						},
					});
				}
			}

			onProgress(index / total / 2 + 0.5);
		});
	}
}
