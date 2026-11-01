# Gitbux CartoGraph

![Gitbux CartoGraph logo](assets/gitbux-cartograph-logo.svg)

Gitbux CartoGraph is an experimental 2D vector map renderer written with the browser Canvas 2D API. It draws country and territory boundaries and Indonesian country labels itself, supports drag-to-pan and pointer-centered zoom, and reports coordinates when the map is clicked. Country labels use the dataset's ISO codes with the browser's Indonesian locale names, falling back to Natural Earth's Indonesian names where a code is unavailable; China is labeled “China.” It does not request OpenStreetMap tiles or use a map-rendering framework.

## Run locally

Open `index.html` through a local HTTP server (not `file://`). For example:

```powershell
py -m http.server 8790
```

Then visit `http://localhost:8790`.

## Map data and attribution

Country and territory boundaries are bundled from [Natural Earth](https://www.naturalearthdata.com/), using its 1:50m Admin 0 countries dataset. Natural Earth data is public domain and can be used, modified, and redistributed, including commercially. The dataset is included locally, so the map itself works offline after the page is served. Natural Earth is a generalized world dataset: it shows country-level geography, not detailed city streets, addresses, or live navigation.

Suggested data credit: “Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.”

## Project credits

Project credits: **Rafie Akila Cloud** and **Bawapi**.

The CartoGraph source code is licensed under the MIT License; see [`LICENSE`](LICENSE). Natural Earth map data remains public domain and is governed by its own terms.
