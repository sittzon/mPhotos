<script lang="ts">
    import { onMount, onDestroy } from "svelte";
	import { writable } from 'svelte/store';
    import type { DateIndexEntry, MetadataRangeResponse, PhotoModel } from "$api";
	import VirtualList from 'svelte-tiny-virtual-list';
	import type { ItemsUpdatedEvent } from 'svelte-tiny-virtual-list';
    import PhotoSlider from '$components/PhotoSlider.svelte';
    import DatePicker from '$components/DatePicker.svelte';
    import Options from "$components/Options.svelte";

    let virtualList: VirtualList;
    
    // Dense array of all photos (after current filters/sort order). Entries are
    // undefined until the range they belong to has been downloaded from the server.
    let photos : Array<PhotoModel | undefined> = [];
    let totalPhotos: number = 0;
    let rangeSize: number = 200;      // Photos per range, confirmed by the first server response
    let dateIndex: DateIndexEntry[] = [];   // Compact month index for the date picker
    let order: 'desc' | 'asc' = 'desc';

    // Range bookkeeping: which ranges are downloaded and which fetches are in flight
    const loadedRanges: Set<number> = new Set();
    const pendingRanges: Map<number, Promise<void>> = new Map();
    // Bumped on every filter/sort change so stale range responses are discarded
    let dataVersion: number = 0;
    
    // The actual array of photos used in the virtual list, divided into chunks/rows for display
    let chunkedPhotos : Array<Array<PhotoModel | undefined>> = [];
    let chunkSize: number =  5;
    let maxChunkSize: number = 12; // Varies based on window width
    const minChunkSize: number = 3; // No less than 3 columns
    
    let datepickerIndex: number = 0;
    let currentPhotoIndex: number = 0;
    let rowHeights: Array<number> = [];

    let currentStartPhotoIndex: number = 0;
    let currentEndPhotoIndex: number = 0;
    // Current scroll position, used to keep the view anchored when row heights change
    let currentScrollOffset: number = 0;
    let scrollOffset: number | undefined = undefined;   // Passed to the virtual list for scroll compensation
    
    let windowHeight: number = 1000;
    let scrollToIndex: number | undefined = undefined;

    let closeAllModalsFromParent = false;
    let isFingerDown: boolean = false;
    
    let isPhotoModalOpen: boolean = false;
    let isScrolling: boolean = false;
    let activePlayingVideoGuids: string[] = [];
    let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let showSquareThumbs: boolean = false; // false = original aspect ratio, true = square
    let filterAll: boolean = true;
    let filterVideos: boolean = false;
    let filterPhotos: boolean = false;
    let filterFavorites: boolean = false;
    let filterShortVideos: boolean = false;
    let filterLivePhotos: boolean = false;
    let filterTrash: boolean = false;
    
    let prevAutoPlayStatus: boolean = false;
    let playLivePhotos: boolean = false;

    let allVideosPaused: boolean = false;

    let blobUrlCache: Record<string, string> = {};
    let preloadingBlobs: Set<string> = new Set();

    async function preloadBlobUrl(guid: string) {
        if (blobUrlCache[guid] || preloadingBlobs.has(guid)) return;
        preloadingBlobs.add(guid);
        try {
            const resp = await fetch(`api/video/${guid}/loop`);
            if (!resp.ok) return;
            const blob = await resp.blob();
            blobUrlCache = { ...blobUrlCache, [guid]: URL.createObjectURL(blob) };
        } catch {
            // preload failed, will use fallback
        } finally {
            preloadingBlobs.delete(guid);
        }
    }

    let libraryHighlighted: boolean = true;
    let favoritesHighlighted: boolean = false;
    let trashHighlighted: boolean = false;

    const months = [ "January", "February", "March", "April", "May", "June", 
           "July", "August", "September", "October", "November", "December" ];

    onMount(async () =>
    {
        windowHeight = window.outerHeight;

        // Read and set options from cookies
        const tempChunkSize = getCookie('mphotos-zoomLevel');
        const tempFilterPhotos = getCookie('mphotos-filterPhotos');
        const tempFilterVideos = getCookie('mphotos-filterVideos');
        const tempFilterFavorites = getCookie('mphotos-filterFavorites');
        const tempFilterShortVideos = getCookie('mphotos-filterShortVideos');
        const tempFilterLivePhotos = getCookie('mphotos-filterLivePhotos');
        const tempPlayLivePhotos = getCookie('mphotos-playLivePhotos');
        const tempSquareProportions = getCookie('mphotos-squareProportions');
        const tempScrollToIndex = getCookie('mphotos-scrollToIndex');
        chunkSize = tempChunkSize? +tempChunkSize : chunkSize;
        filterPhotos = tempFilterPhotos === 'true' ? true : false;
        filterVideos = tempFilterVideos === 'true' ? true : false;
        filterFavorites = tempFilterFavorites === 'true' ? true : false;
        filterShortVideos = tempFilterShortVideos === 'true' ? true : false;
        filterLivePhotos = tempFilterLivePhotos === 'true' ? true : false;
        playLivePhotos = tempPlayLivePhotos === 'true' ? true : false;
        filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
        showSquareThumbs = tempSquareProportions === 'true' ? true : false;

        // Fetch the first range of metadata (includes total count + date index)
        await refreshMetadata('initial');
        if (totalPhotos > 0) {
            // Restore previous scroll position (a row index stored in a cookie)
            const targetRow = tempScrollToIndex ? +tempScrollToIndex : -1;
            setTimeout(() => {
                scrollToIndex = targetRow;
                // Release scrollToIndex so later row height updates don't re-scroll the list
                setTimeout(() => { scrollToIndex = undefined; }, 300);
            }, 10);
        }

        // Add event listeners
        window.addEventListener("orientationchange", () => calcRowHeights(showSquareThumbs, true));
        window.addEventListener("resize", () => calcRowHeights(showSquareThumbs, true));
        window.addEventListener("scroll", handleScrollCapture, true);
        window.addEventListener("scroll", () => {isFingerDown = true; handleCloseAllModals()});
        window.addEventListener("touchstart", handleTouchStart);
        window.addEventListener("touchend", handleTouchEnd);
        window.addEventListener("touchcancel", handleTouchEnd);
        window.addEventListener("keyup", keyPressUp);
        
        // Events from FilterOptions
        window.addEventListener("showAll", () => {
            filterAll = !filterAll; 
            filterFavorites = filterAll? false : filterFavorites;
            filterVideos = filterAll? false : filterVideos;
            filterShortVideos = filterAll? false : filterShortVideos;
            filterLivePhotos = filterAll? false : filterLivePhotos;
            filterPhotos = filterAll? false : filterPhotos;
            setCookie('mphotos-filterPhotos', filterPhotos.toString());
            setCookie('mphotos-filterVideos', filterVideos.toString());
            setCookie('mphotos-filterFavorites', filterFavorites.toString());
            setCookie('mphotos-filterShortVideos', filterShortVideos.toString());
            setCookie('mphotos-filterLivePhotos', filterLivePhotos.toString());
            refreshMetadata('filters')});
        window.addEventListener("toggleVideos", () => {
            filterVideos = !filterVideos; 
            filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterVideos', filterVideos.toString());
            refreshMetadata('filters')});
        window.addEventListener("togglePhotos", () => {
            filterPhotos = !filterPhotos; 
            filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterPhotos', filterPhotos.toString());
            refreshMetadata('filters')});
        window.addEventListener("toggleFavorites", () => {
            filterFavorites = !filterFavorites; 
            filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterFavorites', filterFavorites.toString());
            refreshMetadata('filters')});
        window.addEventListener("toggleShortVideos", () => {
            filterShortVideos = !filterShortVideos;
            filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterShortVideos', filterShortVideos.toString());
            refreshMetadata('filters')});
        window.addEventListener("toggleLivePhotos", () => {
            filterLivePhotos = !filterLivePhotos;
            filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterLivePhotos', filterLivePhotos.toString());
            refreshMetadata('filters')});

        // Show elements again immediately on user action
        ['click', 'touchstart', 'mousemove'].forEach(event => {
            document.addEventListener(event, () => {
                const els = document.getElementsByClassName('fadeout');
                Array.from(els).forEach((el: Element) => {
                    (el as HTMLElement).style.opacity = '1';     // instantly show
                    resetClass(el as HTMLElement, 'fadeout');  // restart fade timer
                });
            });
        });
        
        // Dark/Light mode based on system preference
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const v = document.getElementById('virtual-list-wrapper') as HTMLElement;
        v.classList.toggle("bg-black", prefersDark);
    });

    const keyPressUp = (key: KeyboardEvent) => {
        isFingerDown = true;
        if (key.key === 'Escape') {
            handleCloseAllModals();
        }
    }

    const getCookie = (name: string) => {
        return document.cookie
            .split('; ')
            .find(row => row.startsWith(name))?.split('=')[1]
    }

    const setCookie = (key: string, value: string) => {
        document.cookie = key + '=' + value;
    }

    // Resets fadeout animation on element
    const resetClass = (el: HTMLElement, className: string) => {
        // Reset the animation by removing and re-adding the class
        el.classList.remove(className);
        void el.offsetWidth; // forces reflow so the animation can restart
        el.classList.add(className);
    }

    // Split any array into groups of n size
    const chunkArray = (array: Array<PhotoModel | undefined>, size: number) => {
        const chunked: Array<Array<PhotoModel | undefined>> = [];
        // Push empty row at top
        chunked.push([]);
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    }

    // Rebuild the rows (chunked photos) from the dense photo array and recalculate row heights.
    // To be run when photo contents, chunk size or sort order changed.
    // When `compensate` is true the scroll offset is adjusted for height changes
    // above the viewport, so loading a range does not shift the current view.
    const rebuildRows = (compensate: boolean = false) => {
        if (totalPhotos === 0) {
            chunkedPhotos = [];
            rowHeights = [80];
            activePlayingVideoGuids = [];
            cancelScrollDebounce();
            return;
        }
        chunkedPhotos = chunkArray(photos, chunkSize);
        calcRowHeights(showSquareThumbs, compensate);
        activePlayingVideoGuids = [];
        cancelScrollDebounce();
    }

    // Update max chunk size based on window width
    // To be run when window is resized, orientation changed or zooming in/out
    const updateMaxChunkSize = () => {
        maxChunkSize = window.innerWidth > 1200 ? 12 : (window.innerWidth > 800 ? 9 : 7);
    }

    // Sets new zoom level and updates chunked photos
    const zoomIn = () => {
        updateMaxChunkSize();
        if (chunkSize - minChunkSize > 0) {
            chunkSize -= 2;
            setCookie('mphotos-zoomLevel', chunkSize.toString());
            rebuildRows();
        }
    }
    
    // Sets new zoom level and updates chunked photos
    const zoomOut = () => {
        updateMaxChunkSize();
        if (chunkSize < maxChunkSize) {
            chunkSize += 2;
            setCookie('mphotos-zoomLevel', chunkSize.toString());
            rebuildRows();
        }
    }

    // Calculate row heights based on current chunk size, window width and thumbnail proportions.
    // Rows whose photos have not been downloaded yet are given an estimated height
    // (the average of the loaded rows), which is replaced with the real height as
    // soon as the range containing them arrives.
    const calcRowHeights = (useSquareThumbs: boolean = false, compensate: boolean = false) => {
        updateMaxChunkSize();
        const windowInnerWidth = window.innerWidth;
        const maxImgWidth = windowInnerWidth / chunkSize;
        const oldHeights = rowHeights;
        const newHeights: number[] = [];

        // Row height 80px at the top
        newHeights.push(80);

        if (useSquareThumbs) {
            for (let i = 1; i < chunkedPhotos.length; ++i) {
                newHeights.push(maxImgWidth); // fixed size for square thumbs
            }
        } else {
            let heightSum = 0;
            let heightCount = 0;
            const unloadedRows: number[] = [];

            for (let i = 1; i < chunkedPhotos.length; ++i) {
                const chunk = chunkedPhotos[i];
                let maxHeight = 0;
                let hasLoadedPhotos = false;

                // Calculate the tallest thumbnail aspect ratio for current row/chunk
                for (let n = 0; n < chunk.length; ++n) {
                    const photo = chunk[n];
                    if (photo && photo.height && photo.width) {
                        hasLoadedPhotos = true;
                        const aspectRatio = photo.width / photo.height;
                        const h = maxImgWidth / aspectRatio;
                        maxHeight = h > maxHeight ? h : maxHeight;
                    }
                }

                if (hasLoadedPhotos) {
                    const height = +maxHeight.toFixed(0);
                    newHeights.push(height);
                    heightSum += height;
                    heightCount++;
                } else {
                    // No information about this range yet, assume a height for now
                    unloadedRows.push(i);
                    newHeights.push(0);
                }
            }

            const estimatedHeight = heightCount > 0
                ? Math.round(heightSum / heightCount)
                : Math.round(maxImgWidth);
            for (const row of unloadedRows) {
                newHeights[row] = estimatedHeight;
            }
        }

        // Keep the first visible row anchored when heights above the viewport changed
        // (skipped while a scroll target is pending, the scroll target handles it)
        if (compensate && scrollToIndex === undefined && currentStartPhotoIndex > 1) {
            let delta = 0;
            for (let i = 1; i < currentStartPhotoIndex && i < newHeights.length; i++) {
                delta += newHeights[i] - (oldHeights[i] ?? newHeights[i]);
            }
            if (delta !== 0) {
                scrollOffset = currentScrollOffset + delta;
            }
        }

        rowHeights = newHeights;
        if (totalPhotos > 0) virtualList?.recomputeSizes(0);
    }

    // Opens photo modal
    const openModal = (photo: PhotoModel, index: number) => {
        console.log("Opening photo modal for index:", index);
        currentPhotoIndex = index;
        isPhotoModalOpen = true;
    }

    // Handles touch start event
    const handleTouchStart = () => {
        isFingerDown = true;
    }

    // Handles touch end event
    const handleTouchEnd = () => {
        isFingerDown = false;
    }

    // Handles closing the photo slider modal
    const handleClosePhotoSlider = () => {
        isPhotoModalOpen = false;
    }

    // Handles closing all modals
    const handleCloseAllModals = () => {
        if (isFingerDown && closeAllModalsFromParent == false) {
            closeAllModalsFromParent = true;
            // Reset after 10ms
            setTimeout(() => {
                closeAllModalsFromParent = false;
            }, 10);
        } else {
            closeAllModalsFromParent = false;
        }
    }

    function cancelScrollDebounce() {
        if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
        scrollDebounceTimer = null;
    }

    onDestroy(() => {
        cancelScrollDebounce();
        Object.values(blobUrlCache).forEach(url => URL.revokeObjectURL(url));
    });

    function onScrollSettled(start: number, end: number) {
        isScrolling = false;
        const visible: string[] = [];
        for (let i = start; i < end; i++) {
            const row = chunkedPhotos[i];
            if (row) {
                for (const photo of row) {
                    if (photo?.sidecarGuid) {
                        visible.push(photo.guid);
                        preloadBlobUrl(photo.sidecarGuid);
                    }
                }
            }
        }
        const oldPlaying = activePlayingVideoGuids;
        const newPlaying = visible.slice(0, 5);
        activePlayingVideoGuids = newPlaying;
        if (prevAutoPlayStatus) {
            const videos = document.getElementsByTagName('video');
            for (const video of Array.from(videos)) {
                video.play();
            }
            allVideosPaused = false;
            playLivePhotos = true;
            prevAutoPlayStatus = true;
        }
    }

    // Handles list item updates (for scroll position, setting datepicker index)
    const handleListItemUpdate = (e: ItemsUpdatedEvent) => {
        const { start, end } = e.detail;
        currentStartPhotoIndex = start;
        currentEndPhotoIndex = end;
        console.log("start-end: "+start+"-"+end)

        isScrolling = true;
        if (!allVideosPaused) pauseAllVideos();
        activePlayingVideoGuids = [];
        cancelScrollDebounce();
        scrollDebounceTimer = setTimeout(() => onScrollSettled(start, end), 100);

        const middlePhotoRow = start + Math.floor((end - start) / 2);
        const photoIndex = middlePhotoRow * chunkSize;
        datepickerIndex = photoIndex;
        const tempScrollIndex = getCookie('mphotos-scrollToIndex');
        if (tempScrollIndex && +tempScrollIndex === middlePhotoRow) {
            fetchVisibleRanges(start, end);
            return;
        }
        setCookie('mphotos-scrollToIndex', middlePhotoRow.toString());

        // Download the metadata ranges that are visible (or about to be visible)
        fetchVisibleRanges(start, end);
    }

    // Ensure the ranges covering the given visible row span are downloaded
    const fetchVisibleRanges = (startRow: number, endRow: number) => {
        if (totalPhotos === 0) return;
        const firstPhoto = Math.max(0, (startRow - 1) * chunkSize);
        const lastPhoto = Math.min(totalPhotos - 1, (endRow - 1) * chunkSize + chunkSize - 1);
        if (lastPhoto >= firstPhoto) {
            ensureRangesForPhotos(firstPhoto, lastPhoto);
        }
    }

    // Tracks the actual scroll position of the virtual list. Uses the capture phase
    // because the library does not emit its afterScroll event for programmatic scrolls,
    // and scroll events themselves do not bubble.
    const handleScrollCapture = (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (target && target.classList && target.classList.contains('virtual-list-wrapper')) {
            currentScrollOffset = target.scrollTop;
        }
    };

    // Tracks the actual scroll position, used as base for scroll compensation
    const handleAfterScroll = (e: CustomEvent<{ offset: number }>) => {
        currentScrollOffset = e.detail.offset;
        handleCloseAllModals();
    };
    
    // Format seconds as mm:ss
    function formatDuration(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    const pauseAllVideos = () => 
    {
        const videos = document.getElementsByTagName('video');
        for (const video of Array.from(videos)) {
            video.pause();
        }
        allVideosPaused = true;
        prevAutoPlayStatus = playLivePhotos;
        playLivePhotos = false;
    }

    // Build query params reflecting the current filter and sort options
    const metadataParams = (): URLSearchParams => {
        const params = new URLSearchParams();
        if (filterTrash) params.set('trash', 'only');
        if (filterFavorites) params.set('fav', '1');
        if (!filterAll) {
            const types: string[] = [];
            if (filterPhotos) types.push('photo');
            if (filterLivePhotos) types.push('live');
            if (filterVideos) types.push('video');
            if (filterShortVideos) types.push('short-video');
            if (types.length > 0) params.set('types', types.join(','));
        }
        if (order === 'asc') params.set('order', 'asc');
        return params;
    }

    // Fetch a single metadata range from the server.
    // Returns null if the response is stale (filters/order changed while in flight).
    const requestRange = async (rangeIndex: number, version: number): Promise<MetadataRangeResponse | null> => {
        const params = metadataParams();
        params.set('range', rangeIndex.toString());
        params.set('size', rangeSize.toString());
        try {
            const response = await fetch(`/api/metadata?${params.toString()}`, {
                method: 'GET',
                headers: { 'content-type': 'application/json' }
            });
            if (!response.ok) {
                console.error("Failed to fetch photo metadata, status:", response.status);
                return null;
            }
            const data: MetadataRangeResponse = await response.json();
            if (version !== dataVersion) return null;   // Superseded by a filter/sort change
            return data;
        } catch (e) {
            console.error("Failed to fetch photo metadata:", e);
            return null;
        }
    };

    // Replace all client-side state with a fresh snapshot from the server
    const applySnapshot = (data: MetadataRangeResponse) => {
        totalPhotos = data.total;
        rangeSize = data.rangeSize;
        dateIndex = data.dateIndex;
        photos = new Array<PhotoModel | undefined>(totalPhotos).fill(undefined);
        loadedRanges.clear();
        applyRangeData(data);
        rebuildRows(false);
    };

    // Store the photos of a fetched range in the dense photo array
    const applyRangeData = (data: MetadataRangeResponse) => {
        const start = data.rangeIndex * data.rangeSize;
        for (let i = 0; i < data.photos.length; i++) {
            photos[start + i] = data.photos[i];
        }
        loadedRanges.add(data.rangeIndex);
        dateIndex = data.dateIndex;
    };

    // Apply a range that was fetched while scrolling. If the library size changed
    // in the meantime (e.g. new photos were indexed), fall back to a full snapshot.
    const applyRange = (data: MetadataRangeResponse) => {
        if (data.total !== totalPhotos || data.rangeSize !== rangeSize) {
            applySnapshot(data);
            return;
        }
        applyRangeData(data);
        rebuildRows(true);
    };

    // Make sure the given range is downloaded; fetches it if needed
    const ensureRange = (rangeIndex: number): Promise<void> => {
        if (rangeIndex < 0 || rangeIndex * rangeSize >= totalPhotos) return Promise.resolve();
        if (loadedRanges.has(rangeIndex)) return Promise.resolve();
        const pending = pendingRanges.get(rangeIndex);
        if (pending) return pending;

        const version = dataVersion;
        const promise = requestRange(rangeIndex, version)
            .then(data => { if (data) applyRange(data); })
            .finally(() => { pendingRanges.delete(rangeIndex); });
        pendingRanges.set(rangeIndex, promise);
        return promise;
    };

    // Make sure all ranges covering photos [fromIndex, toIndex] are downloaded,
    // with one extra range of margin on each side
    const ensureRangesForPhotos = (fromIndex: number, toIndex: number, marginRanges: number = 1): Promise<void> => {
        if (totalPhotos === 0) return Promise.resolve();
        const from = Math.max(0, Math.min(fromIndex, toIndex));
        const to = Math.min(totalPhotos - 1, Math.max(fromIndex, toIndex));
        const firstRange = Math.max(0, Math.floor(from / rangeSize) - marginRanges);
        const lastRange = Math.min(
            Math.ceil(totalPhotos / rangeSize) - 1,
            Math.floor(to / rangeSize) + marginRanges
        );
        const promises: Promise<void>[] = [];
        for (let r = firstRange; r <= lastRange; r++) {
            promises.push(ensureRange(r));
        }
        return Promise.all(promises).then(() => undefined);
    };

    // Reload metadata from scratch; used on initial load and when filters or sort order change
    const refreshMetadata = async (mode: 'initial' | 'filters' | 'sort'): Promise<void> => {
        const version = ++dataVersion;
        pendingRanges.clear();
        loadedRanges.clear();
        const data = await requestRange(0, version);
        if (!data || version !== dataVersion) return;
        applySnapshot(data);

        if (mode !== 'initial' && totalPhotos > 0) {
            // Jump to the top of the (new) list
            setTimeout(() => {
                scrollToIndex = 0;
                setTimeout(() => { scrollToIndex = undefined; }, 300);
            }, 10);
        }
    };

    // Scroll to a photo index (used by the date picker). The range containing the
    // photo is downloaded (if not already) and the heights are updated along the way.
    const jumpToPhotoIndex = (photoIndex: number) => {
        const row = Math.floor(Math.max(0, photoIndex) / chunkSize);
        scrollToIndex = row;
        ensureRangesForPhotos(photoIndex, photoIndex, 1).finally(() => {
            setTimeout(() => { scrollToIndex = undefined; }, 300);
        });
    };

    // Change sort order; ranges are re-fetched from the server in the new order
    const setOrder = (latestFirst: boolean) => {
        order = latestFirst ? 'desc' : 'asc';
        refreshMetadata('sort');
    };

    const setFilters = (photos: boolean, videos: boolean, favorites: boolean, shortVideos: boolean, livePhotos: boolean, trash: boolean) => {
        filterPhotos = photos;
        filterVideos = videos;
        filterFavorites = favorites;
        filterShortVideos = shortVideos;
        filterLivePhotos = livePhotos;
        filterTrash = trash;
        filterAll = (!filterVideos && !filterFavorites && !filterShortVideos && !filterLivePhotos && !filterPhotos);
        setCookie('mphotos-filterPhotos', filterPhotos.toString());
        setCookie('mphotos-filterVideos', filterVideos.toString());
        setCookie('mphotos-filterFavorites', filterFavorites.toString());
        setCookie('mphotos-filterShortVideos', filterShortVideos.toString());
        setCookie('mphotos-filterLivePhotos', filterLivePhotos.toString());
    }

    const togglePlayLivePhotos = () => {
        playLivePhotos = !playLivePhotos;
        if (!playLivePhotos) {
            if (!allVideosPaused) pauseAllVideos();
            activePlayingVideoGuids = [];
        }
        else
        {
            onScrollSettled(currentStartPhotoIndex, currentEndPhotoIndex);
        }
        setCookie('mphotos-playLivePhotos', playLivePhotos.toString());
    }
</script>

{#if isPhotoModalOpen}
    <PhotoSlider 
        photos={photos} 
        photoIndex={currentPhotoIndex} 
        closeModal={handleClosePhotoSlider} 
        nrToPreload={2}
        ensurePhotoLoaded={(index) => ensureRangesForPhotos(index, index)} />
{/if}
<Options
    currentChunkSize={chunkSize}
    maxChunkSize={maxChunkSize}
    minChunkSize={minChunkSize}
    orderCallback={(latestFirst) => {
        setOrder(latestFirst);
    }}
    zoomInCallback={() => {
        zoomIn();
    }}
    zoomOutCallback={() => {
        zoomOut();
    }}
    toggleSquareProportionsCallback={() => {
        showSquareThumbs = !showSquareThumbs;
        calcRowHeights(showSquareThumbs, true);
        setCookie('mphotos-squareProportions', showSquareThumbs.toString());
    }}
    closeFromParent={closeAllModalsFromParent}
    isVideoFiltered={filterVideos}
    isFavoriteFiltered={filterFavorites}
    isShowingAll={filterAll}
    arePhotosSquare={showSquareThumbs}
    isShortVideosFiltered={filterShortVideos}
    isPhotosFiltered={filterPhotos}
    isLivePhotosFiltered={filterLivePhotos}
    playLivePhotos={playLivePhotos}
    togglePlayLivePhotosCallback={() => {
        togglePlayLivePhotos();
    }}
/>
<DatePicker 
    dateIndex={dateIndex} 
    photoIndex={datepickerIndex} 
    on:setScroll={(e) => {jumpToPhotoIndex(e.detail)}}
    closeFromParent={closeAllModalsFromParent}
/>
<div class="text-rounded-corners nr-of-photos">
    <p>{totalPhotos}</p>
</div>

<div id="virtual-list-wrapper">
    {#if chunkedPhotos.length === 0}
        <div class="text-rounded-corners no-photos-available">
            <p>No photos available</p>
        </div>
    {:else}
    <div id="virtual-list-container">
        <VirtualList 
            bind:this={virtualList}
            width="100%" 
            height={windowHeight}
            itemCount={chunkedPhotos.length} 
            itemSize={rowHeights}
            scrollToAlignment='center'
            scrollToBehaviour='instant'
            on:itemsUpdated={handleListItemUpdate}
            on:afterScroll={handleAfterScroll}
            {scrollToIndex}
            {scrollOffset}
            >

        <div slot="item" let:index let:style {style}>
            <table style="width: 100%; height: 100%; table-layout: fixed;">
                <tbody>
                    <tr style="text-align:center;">
                        {#each chunkedPhotos[index] as currentPhotoMeta, itemIndex}
                            <td style="">
                                {#if currentPhotoMeta}
                                <a on:click={() => openModal(currentPhotoMeta, (index-1)*chunkSize + itemIndex)} href='/'>
                                    <div style="position: relative; display: inline-block;">
                                        {#if currentPhotoMeta.sidecarGuid && chunkSize <= 5 && blobUrlCache[currentPhotoMeta.sidecarGuid]}
                                            <video 
                                            id={currentPhotoMeta.guid}
                                            muted autoplay={playLivePhotos} loop playsinline preload="none"
                                            poster="api/photos/{currentPhotoMeta.guid}/thumb"
                                            src={blobUrlCache[currentPhotoMeta.sidecarGuid]}
                                            class:square-thumb={showSquareThumbs}
                                            style="--row-height: {(rowHeights[index] ?? 80)-2}px;"
                                            ></video>
                                        {:else}
                                            <img 
                                            id={currentPhotoMeta.guid}
                                            src={currentPhotoMeta.type === 'live-photo-video'? `api/photos/${currentPhotoMeta.referenceGuid}/thumb` : `api/photos/${currentPhotoMeta.guid}/thumb`}
                                            alt={currentPhotoMeta.dateTaken}
                                            class:square-thumb={showSquareThumbs}
                                            style="--row-height: {(rowHeights[index] ?? 80)-2}px;"
                                            >
                                        {/if}
                                        {#if currentPhotoMeta.type === 'video' || currentPhotoMeta.type === 'short-video'}
                                            {#if currentPhotoMeta.lengthSeconds}
                                            <span class="video-duration-overlay">
                                                {formatDuration(currentPhotoMeta.lengthSeconds)}
                                            </span>
                                            {/if}
                                        {/if}
                                        {#if currentPhotoMeta.isFavorite}
                                            <span class="video-duration-overlay favorite-icon">
                                            </span>
                                        {/if}
                                    </div>
                                </a>
                                {/if}
                            </td>
                        {/each}
                    </tr>
                </tbody>
            </table>
        </div>

        </VirtualList>
    </div>
    {/if}
</div>

<div class="bottom-bar">
    <div>
        <div>
            <button id="library-button" class="interface {!libraryHighlighted? 'opacity-down' : ''}" 
                on:click={() => {
                    libraryHighlighted = true;
                    favoritesHighlighted = false;
                    trashHighlighted = false;
                    setFilters(true, true, false, false, false, false);
                    refreshMetadata('filters'); }} 
                    aria-label="Show all photos and videos">
            </button>
        </div>
        <div>
            <button id="favorites-button" class="interface {!favoritesHighlighted? 'opacity-down' : ''}" 
                on:click={() => {
                    libraryHighlighted = false;
                    favoritesHighlighted = true;
                    trashHighlighted = false;
                    setFilters(true, true, true, false, false, false);
                    refreshMetadata('filters'); }}
                    aria-label="Show favorite photos and videos">
            </button>
        </div>
        <div>
            <button id="deleted-button" class="interface {!trashHighlighted? 'opacity-down' : ''}" 
                on:click={() => { 
                    libraryHighlighted = false;
                    favoritesHighlighted = false;
                    trashHighlighted = true;
                    setFilters(false, false, false, false, false, true);
                    refreshMetadata('filters'); 
                    }}
                    aria-label="Show photos in trash, to be deleted">
            </button>
        </div>
    </div>
</div>

<style>
    .bg-black {
        background-color: #121212;
        color: #e0e0e0;
    }

    #virtual-list-wrapper {
        position: absolute;
        width: 100dvw;
        height: 100dvh;
        z-index: -1000;
    }

    #virtual-list-container {
        overflow-x: hidden;
        touch-action: pan-y;
        /* background-color: black; */
        z-index: -1;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
    }

    .text-rounded-corners {
        box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
        background-color: rgba(255,255,255,0.7);
        color: darkslategray;
        width: fit-content;
        border-radius: 12px;
        padding: 0 3px 0 3px;
    }
    
    .video-duration-overlay {
        position: absolute;
        right: 2px;
        bottom: 2px;
        background: rgba(0,0,0,0.3);
        color: #fff;
        font-size: 0.7em;
        padding: 2px 2px;
        border-radius: 4px;
        z-index: 3;
        pointer-events: none;
    }

    td a img {
        max-height: var(--row-height);
        border-radius: 5px;
        max-width: 100%;
        vertical-align: top;
    }
    
    td a img.square-thumb {
        object-fit: cover;
        width: var(--row-height);
        height: var(--row-height);
    }

    td a video {
        max-height: var(--row-height);
        border-radius: 5px;
        max-width: 100%;
        vertical-align: top;
        object-fit: contain;
    }

    td a video.square-thumb {
        object-fit: cover;
        width: var(--row-height);
        height: var(--row-height);
    }

    .nr-of-photos {
        position: fixed;
        left: 10px;
        top: max(105px, calc(var(--safe-top) + 65px)); 
        height: 25px;
        padding: 0 5px 0 5px;
    }

    .no-photos-available {
        position: absolute;
        top: 50%;
        left: 50%;
        right: 50%;
        width: 180px;
        height: 25px;
        transform: translate(-50%, -50%);
        text-align: center;
    }

    .interface {
        box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
        border-radius: 12px;
    }
    
    .bottom-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 80px;
    }

    .bottom-bar div {
        display: flex; 
        justify-content: center; 
        align-items: center; 
        height: 100%;
    }

    .bottom-bar div div {
        background-color: rgba(255,255,255,0.7);
        border-radius: 12px;
        height: 48px;
        width: 48px;
        margin: 0 15px 0 15px;
    }
    
    .bottom-bar div button {
        height: 48px;
        width: 48px;
        border: 1px solid white;
        color: black;
    }

    .favorite-icon {
        background: url('/favorite-checked.svg') no-repeat center;
        background-size: contain;
        top: 2px;
        left: 2px;
        right: auto;
        bottom: auto;
        width: 20px;
        height: 20px;
    }

    #library-button {
        background: url('/library.svg') no-repeat center;
        background-size: contain;
    }

    #favorites-button {
        background: url('/favorite.svg') no-repeat center;
        background-size: contain;
    }

    #deleted-button {
        background: url('/deleted.svg') no-repeat center;
        background-size: contain;
    }

    .opacity-down {
        opacity: 0.2;
    }

</style>