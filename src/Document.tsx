import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';

// The document every page is rendered into (the plugin picks it up by its name); it ships no
// client code of its own.
export default function Document(props: ParentProps) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" href="/favicon/favicon.ico" sizes="any" />
				<link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
				<link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png" />
				<link rel="manifest" href="/favicon/site.webmanifest" />
				<HydrationScript />
			</head>
			<body>{props.children}</body>
		</html>
	);
}
