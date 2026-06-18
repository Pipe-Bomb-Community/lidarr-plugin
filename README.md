<h1>
    <img src="https://raw.githubusercontent.com/Pipe-Bomb/.github/refs/heads/master/assets/logos/Pipe%20Bomb%20no%20background%20w%20outline.png" width="40" />
    Lidarr Plugin
</h1>

Scans all albums with a MusicBrainz release group ID and monitors them in Lidarr. Also displays external links to Lidarr for albums and artists if a public URL is provided in settings.

## Installation

Clone the repo into your [Pipe Bomb server's](https://github.com/pipe-bomb/server) `plugins` directory. Then inside, run:

```bash
npm ci
npm run build
```

## Usage

This plugin only tracks albums that have the `musicbrainz_release_group_id` identity.

## Contributing

Contributions are welcome. Please PR with additional or improved functionality!
