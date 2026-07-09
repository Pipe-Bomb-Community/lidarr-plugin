export interface Image {
	coverType: "poster" | "fanart" | "clearlogo" | "banner" | "cover" | string;
	url: string;
	remoteUrl: string;
}

export interface Artist {
	id: number;
	name: string;
	disambiguation: string;
	path: string;
	mbId: string;
	type: "Person" | "Group" | string;
	genres: string[];
	images: Image[];
	tags: any[];
}

export interface Album {
	id: number;
	mbId: string;
	title: string;
	disambiguation: string;
	overview: string;
	albumType: "Single" | "Album" | "EP" | string;
	secondaryAlbumTypes: string[];
	releaseDate: string;
	genres: string[];
	images: Image[];
}

export interface Release {
	quality: string;
	qualityVersion: number;
	releaseGroup: string;
	releaseTitle: string;
	indexer: string;
	size: number;
	customFormatScore: number;
	customFormats: any[];
}

export interface Track {
	id: number;
	title: string;
	trackNumber: string;
	qualityVersion: number;
}

export interface TrackFile {
	id: number;
	path: string;
	quality: string;
	qualityVersion: number;
	releaseGroup: string;
	size: number;
	dateAdded: string;
}

interface BaseLidarrPayload {
	artist: Artist;
	instanceName: string;
	applicationUrl: string;
}

export interface LidarrGrabPayload extends BaseLidarrPayload {
	eventType: "Grab";
	albums: Album[];
	release: Release;
	downloadClient: string;
	downloadClientType: string;
	downloadId: string;
}

export interface LidarrRetagPayload extends BaseLidarrPayload {
	eventType: "Retag";
	trackFile: TrackFile;
}

export interface LidarrDownloadPayload extends BaseLidarrPayload {
	eventType: "Download";
	album: Album;
	tracks: Track[];
	trackFiles: TrackFile[];
	isUpgrade: boolean;
	downloadClient: string;
	downloadClientType: string;
	downloadId: string;
}

export type LidarrWebhookPayload =
	| LidarrGrabPayload
	| LidarrRetagPayload
	| LidarrDownloadPayload;
