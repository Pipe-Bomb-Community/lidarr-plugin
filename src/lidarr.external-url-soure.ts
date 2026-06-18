import {
	AlbumExternalUrlHelper,
	ArtistExternalUrlHelper,
	ExternalUrl,
	ExternalUrlSource,
	TrackExternalUrlHelper,
} from "@sdk";
import { LidarrConfigManager } from "./lidarr.config-manager.js";

export class LidarrExternalUrlSource implements ExternalUrlSource {
	constructor(private readonly config: LidarrConfigManager) {}

	getArtistUrls(helper: ArtistExternalUrlHelper): ExternalUrl[] | null {
		let publicUrl = this.config.getPublicUrl();
		if (!publicUrl) {
			return null;
		}

		const identity = helper.getIdentity("musicbrainz_artist_id");
		if (!identity) {
			return null;
		}

		if (!publicUrl.endsWith("/")) {
			publicUrl += "/";
		}

		return [
			{
				name: "Lidarr Artist",
				iconId: "lidarr",
				url: `${publicUrl}artist/${identity.identity}`,
			},
		];
	}

	getTrackUrls(helper: TrackExternalUrlHelper): ExternalUrl[] | null {
		return null;
	}

	getAlbumUrls(helper: AlbumExternalUrlHelper): ExternalUrl[] | null {
		let publicUrl = this.config.getPublicUrl();
		if (!publicUrl) {
			return null;
		}

		const identity = helper.getIdentity("musicbrainz_release_group_id");
		if (!identity) {
			return null;
		}

		if (!publicUrl.endsWith("/")) {
			publicUrl += "/";
		}

		return [
			{
				name: "Lidarr Album",
				iconId: "lidarr",
				url: `${publicUrl}album/${identity.identity}`,
			},
		];
	}
}
