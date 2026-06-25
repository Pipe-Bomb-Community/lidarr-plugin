import { DataClient, Logger } from "@sdk";
import { LidarrConfigManager } from "./lidarr.config-manager.js";
import { AlbumResource, ArtistResource } from "lidarr";

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

		const rootFolder = await this.getRootFolderPath();
		if (!rootFolder) {
			throw new Error("Root folder is not defined");
		}
		let qualityProfileId = rootFolder.defaultQualityProfileId;
		let metadataProfileId = rootFolder.defaultMetadataProfileId;

		const qualityProfile = await this.getQualityProfile();
		if (qualityProfile) {
			qualityProfileId = qualityProfile.id;
		}
		const metadataProfile = await this.getMetadataProfile();
		if (metadataProfile) {
			metadataProfileId = metadataProfile.id;
		}

		if (!qualityProfileId) {
			throw new Error("Quality profile is not defined");
		}
		if (!metadataProfileId) {
			throw new Error("Metadata profile is not defined");
		}

		const allArtistsResponse = await sdk.Artist.getApiV1Artist();
		if (allArtistsResponse.error) {
			throw allArtistsResponse.error;
		}
		const artists = new Map<string, ArtistResource>();
		for (const artist of allArtistsResponse.data ?? []) {
			if (!artist.foreignArtistId) {
				this.logger.error(
					`Lidarr artist "${artist.id}" didn't have a foreign artist ID`,
				);
				continue;
			}
			artists.set(artist.foreignArtistId, artist);
		}

		const albums = new Map<string, AlbumResource>();

		let iteratedArtists = 0;
		for (const artist of artists.values()) {
			const albumResponse = await sdk.Album.getApiV1Album({
				query: {
					artistId: artist.id,
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
			onProgress(iteratedArtists++ / artists.size / 2);
		}

		this.logger.log(
			`Located ${albums.size} albums across ${artists.size} artists`,
		);

		const total = await this.dataClient.getAlbumCount();

		let index = 0;
		await this.dataClient.forEachAlbum(async (albumUuid) => {
			if (!index++) {
				onProgress(0);
			}

			const album = await this.dataClient.getAlbum(albumUuid, {
				relations: {
					identities: true,
				},
			});

			if (album?.identities) {
				const releaseGroups = album.identities.filter(
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

					const albumArtist = album.artist;

					if (!albumArtist?.foreignArtistId) {
						this.logger.error(
							`Lidarr didn't return a complete artist with album lookup "${albumUuid}" (MBID ${releaseGroup})`,
						);
						continue;
					}

					this.logger.log(
						`Adding album "${albumUuid}" to Lidarr (MBID ${releaseGroup}) (${album.artist?.artistName ?? "Unknown Artist"} - ${album.title ?? "Unknown Album"})`,
					);

					const { response, data, error } = await sdk.Album.postApiV1Album({
						body: {
							...album,
							monitored: true,
							artist: {
								...album.artist,
								rootFolderPath: rootFolder.path,
								qualityProfileId,
								metadataProfileId,
								monitored: true,
								monitorNewItems: "none",
							},
						},
					});

					if (!response) {
						this.logger.error("Didn't receive a response from Lidarr");
						continue;
					}

					if (response.status != 201) {
						this.logger.error(
							`Received HTTP code ${response.status} from Lidarr:`,
							error,
						);
						continue;
					}

					if (data?.artist?.foreignArtistId) {
						artists.set(data.artist.foreignArtistId, data.artist);
					}
				}
			}

			onProgress(index / total / 2 + 0.5);
		});
	}

	async getRootFolderPath() {
		const rootPath = this.config.getRootFolderPath();
		const sdk = this.config.getSdk();

		if (!rootPath || !sdk) {
			return null;
		}

		const { data } = await sdk.RootFolder.getApiV1Rootfolder();
		return data?.find((folder) => folder.path == rootPath) ?? null;
	}

	async getQualityProfile() {
		const name = this.config.getQualityProfileName();
		const sdk = this.config.getSdk();

		if (!name || !sdk) {
			return null;
		}

		const { data } = await sdk.QualityProfile.getApiV1Qualityprofile();
		return data?.find((profile) => profile.name == name) ?? null;
	}

	async getMetadataProfile() {
		const name = this.config.getMetadataProfileName();
		const sdk = this.config.getSdk();

		if (!name || !sdk) {
			return null;
		}

		const { data } = await sdk.MetadataProfile.getApiV1Metadataprofile();
		return data?.find((profile) => profile.name == name) ?? null;
	}
}
