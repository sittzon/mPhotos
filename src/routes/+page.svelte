<script lang="ts">
    import { onMount, onDestroy } from "svelte";
	import { writable } from 'svelte/store';
    import type { PhotoModel } from "$api";
	import VirtualList from 'svelte-tiny-virtual-list';
	import ItemsUpdatedEvent from 'svelte-tiny-virtual-list';
    import PhotoSlider from '$components/PhotoSlider.svelte';
    import DatePicker from '$components/DatePicker.svelte';
    import Options from "$components/Options.svelte";

    let virtualList: VirtualList;
    
    let originalPhotosMetadata : Array<PhotoModel> = [];
    let filteredPhotosMetadata : Array<PhotoModel> = [];
    $: photosAndVideosMetadata = originalPhotosMetadata.filter((photo: PhotoModel) => photo.type != 'live-photo-video');
    
    // The actual array of photos used in the virtual list, divided into chunks/rows for display
    let chunkedPhotos : Array<Array<PhotoModel>> = [];
    let chunkSize: number =  5;
    let maxChunkSize: number = 12; // Varies based on window width
    const minChunkSize: number = 3; // No less than 3 columns
    
    let datepickerIndex: number = 0;
    let currentPhotoIndex: number = 0;
    let rowHeights: Array<number> = [];

    let currentStartPhotoIndex: number = 0;
    let currentEndPhotoIndex: number = 0;
    
    let windowHeight: number = 1000;
    let scrollToIndex: number | undefined = undefined;
    let closeAllModalsFromParent = false;
    let isFingerDown: boolean = false;
    
    let isPhotoModalOpen: boolean = false;
    let isScrolling: boolean = false;
    let activeVideoGuids: string[] = [];
    let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let showSquareThumbs: boolean = false; // false = original aspect ratio, true = square
    let filterAll: boolean = true;
    let filterVideos: boolean = false;
    let filterPhotos: boolean = false;
    let filterFavorites: boolean = false;
    let filterLivePhotoVideos: boolean = false;
    let filterLivePhotos: boolean = false;
    let playLivePhotos: boolean = false;
    let filterTrash: boolean = false;

    let libraryHighlighted: boolean = true;
    let favoritesHighlighted: boolean = false;
    let trashHighlighted: boolean = false;

    const months = [ "January", "February", "March", "April", "May", "June", 
           "July", "August", "September", "October", "November", "December" ];

    $: currentNoPhotos = filteredPhotosMetadata.length > 0? filteredPhotosMetadata.length : 0;

    onMount(async () =>
    {
        windowHeight = window.outerHeight;

        // Read and set options from cookies
        const tempChunkSize = getCookie('mphotos-zoomLevel');
        const tempFilterPhotos = getCookie('mphotos-filterPhotos');
        const tempFilterVideos = getCookie('mphotos-filterVideos');
        const tempFilterFavorites = getCookie('mphotos-filterFavorites');
        const tempFilterLivePhotoVideos = getCookie('mphotos-filterLivePhotoVideos');
        const tempFilterLivePhotos = getCookie('mphotos-filterLivePhotos');
        const tempPlayLivePhotos = getCookie('mphotos-playLivePhotos');
        const tempSquareProportions = getCookie('mphotos-squareProportions');
        const tempScrollToIndex = getCookie('mphotos-scrollToIndex');
        chunkSize = tempChunkSize? +tempChunkSize : chunkSize;
        filterPhotos = tempFilterPhotos === 'true' ? true : false;
        filterVideos = tempFilterVideos === 'true' ? true : false;
        filterFavorites = tempFilterFavorites === 'true' ? true : false;
        filterLivePhotoVideos = tempFilterLivePhotoVideos === 'true' ? true : false;
        filterLivePhotos = tempFilterLivePhotos === 'true' ? true : false;
        playLivePhotos = tempPlayLivePhotos === 'true' ? true : false;
        filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
        showSquareThumbs = tempSquareProportions === 'true' ? true : false;

        // Fetch metadata (includes favorites + trash flags + URL fields)
        await fetch("/api/metadata", {
            method: 'GET',
            headers: {
                'content-type': 'application/json'
            }
        })
        .then((response) => {
            if (response.ok) {
                return response.json();
            } else {
                console.error("Failed to fetch photo metadata, status:", response.status);
                return [];
            }
        })
        .then((data) => {
            originalPhotosMetadata = data;
            photosAndVideosMetadata = originalPhotosMetadata;
            filterPhotosArray();
            if (filteredPhotosMetadata.length > 0) {
                setTimeout(() => {
                    scrollToIndex = tempScrollToIndex ? +tempScrollToIndex : -1;
                }, 10);
            }
        });

        // Add event listeners
        window.addEventListener("orientationchange", () => calcRowHeights(showSquareThumbs));
        window.addEventListener("resize", () => calcRowHeights(showSquareThumbs));
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
            filterLivePhotoVideos = filterAll? false : filterLivePhotoVideos;
            filterLivePhotos = filterAll? false : filterLivePhotos;
            filterPhotos = filterAll? false : filterPhotos;
            setCookie('mphotos-filterPhotos', filterPhotos.toString());
            setCookie('mphotos-filterVideos', filterVideos.toString());
            setCookie('mphotos-filterFavorites', filterFavorites.toString());
            setCookie('mphotos-filterLivePhotoVideos', filterLivePhotoVideos.toString());
            setCookie('mphotos-filterLivePhotos', filterLivePhotos.toString());
            filterPhotosArray()});
        window.addEventListener("toggleVideos", () => {
            filterVideos = !filterVideos; 
            filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterVideos', filterVideos.toString());
            filterPhotosArray()});
        window.addEventListener("togglePhotos", () => {
            filterPhotos = !filterPhotos; 
            filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterPhotos', filterPhotos.toString());
            filterPhotosArray()});
        window.addEventListener("toggleFavorites", () => {
            filterFavorites = !filterFavorites; 
            filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterFavorites', filterFavorites.toString());
            filterPhotosArray()});
        window.addEventListener("toggleLivePhotoVideos", () => {
            filterLivePhotoVideos = !filterLivePhotoVideos;
            filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterLivePhotoVideos', filterLivePhotoVideos.toString());
            filterPhotosArray()});
        window.addEventListener("toggleLivePhotos", () => {
            filterLivePhotos = !filterLivePhotos;
            filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
            setCookie('mphotos-filterLivePhotos', filterLivePhotos.toString());
            filterPhotosArray()});

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
    const chunkArray = (array: Array<any>, size: number) => {
        const chunked = [];
        // Push empty row at top
        chunked.push([]);
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    }

    // Set chunked photos array with current chunk size and calculates row heights
    // To be run when photo contents, width or height are changed or zoom level is changed
    const setChunkedPhotos = () => {
        chunkedPhotos = chunkArray(filteredPhotosMetadata, chunkSize);
        calcRowHeights(showSquareThumbs);
        activeVideoGuids = [];
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
            setChunkedPhotos();
        }
    }
    
    // Sets new zoom level and updates chunked photos
    const zoomOut = () => {
        updateMaxChunkSize();
        if (chunkSize < maxChunkSize) {
            chunkSize += 2;
            setCookie('mphotos-zoomLevel', chunkSize.toString());
            setChunkedPhotos();
        }
    }

    // Calculate row heights based on current chunk size, window width and thumbnail proportions
    const calcRowHeights = (useSquareThumbs: boolean = false) => {
        updateMaxChunkSize();
        rowHeights = [];
        const windowInnerWidth = window.innerWidth;
        const maxImgWidth = windowInnerWidth / chunkSize;

        // Row height 80px at the top
        rowHeights.push(80);

        if (useSquareThumbs) {
            for (let i = 1; i < chunkedPhotos.length; ++i) {
                rowHeights.push(maxImgWidth); // fixed size for square thumbs
            }
            if (currentNoPhotos > 0) virtualList.recomputeSizes(0);
            return;
        }
        
        for (let i = 1; i < chunkedPhotos.length; ++i) {
            const chunk = chunkedPhotos[i];
            
            // Default thumb size is 225x300px
            let maxHeight = 0;
            // Calculate minimum aspect ratio for current row/chunk
            for (let n = 0; n < chunk.length; ++n) {
                if (chunk[n] && chunk[n].height && chunk[n].width) {
                    const aspectRatio = (chunk[n].width ?? 1) / (chunk[n].height ?? 1);
                    const h = maxImgWidth / aspectRatio;
                    maxHeight = h > maxHeight? h : maxHeight;
                }
            }
            const tallestHeight = maxHeight;
            rowHeights.push(+tallestHeight.toFixed(0));
        }

        if (currentNoPhotos > 0) virtualList.recomputeSizes(0);
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

    onDestroy(() => cancelScrollDebounce());

    function onScrollSettled(start: number, end: number) {
        isScrolling = false;
        const visible: string[] = [];
        for (let i = start; i < end; i++) {
            const row = chunkedPhotos[i];
            if (row) {
                for (const photo of row) {
                    if (photo.sidecarGuid) visible.push(photo.guid);
                }
            }
        }
        activeVideoGuids = visible;
    }

    // Handles list item updates (for scroll position, setting datepicker index)
    const handleListItemUpdate = (e: ItemsUpdatedEvent) => {
        const { start, end } = e.detail;
        currentStartPhotoIndex = start;
        currentEndPhotoIndex = end;

        isScrolling = true;
        activeVideoGuids = [];
        cancelScrollDebounce();
        scrollDebounceTimer = setTimeout(() => onScrollSettled(start, end), 100);

        const middlePhotoRow = start + Math.floor((end - start) / 2);
        const photoIndex = middlePhotoRow * chunkSize;
        datepickerIndex = photoIndex;
        const tempScrollIndex = getCookie('mphotos-scrollToIndex');
        if (tempScrollIndex && +tempScrollIndex === middlePhotoRow) {
            return;
        }
        setCookie('mphotos-scrollToIndex', middlePhotoRow.toString());
    }
    
    // Format seconds as mm:ss
    function formatDuration(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Set filteredPhotosMetadata according to filter options
    const filterPhotosArray = () => {
        if (filterTrash) {
            filteredPhotosMetadata = originalPhotosMetadata.filter((photo: PhotoModel) => photo.isTrash);
        } else {
            filteredPhotosMetadata = originalPhotosMetadata.filter((photo: PhotoModel) => !photo.isTrash);
        }
        
        if (!filterAll) {
            // typePredicates combines on an OR basis
            const typePredicates: Array<(p: PhotoModel) => boolean> = [];
            if (filterPhotos) typePredicates.push((p) => p.type === 'photo' && p.sidecarGuid == null);
            if (filterVideos) typePredicates.push((p) => p.type === 'video');
            if (filterLivePhotos) typePredicates.push((p) => p.sidecarGuid != null); 

            if (typePredicates.length > 0) {
                filteredPhotosMetadata = filteredPhotosMetadata.filter(
                    (p) => typePredicates.some((fn) => fn(p))
                );
            }

            // All else is on AND basis
            if (filterLivePhotoVideos) 
            {
                filteredPhotosMetadata = filteredPhotosMetadata.filter((p) => p.type === 'live-photo-video');
            }
            if (filterFavorites) {
                filteredPhotosMetadata = filteredPhotosMetadata.filter((p) => p.isFavorite);
            }
        }
        if (filteredPhotosMetadata.length > 0) {
            setChunkedPhotos();
        } else {
            chunkedPhotos = [];
        }
    }

    const setFilters = (photos: boolean, videos: boolean, favorites: boolean, livePhotoVideos: boolean, livePhotos: boolean, trash: boolean) => {
        filterPhotos = photos;
        filterVideos = videos;
        filterFavorites = favorites;
        filterLivePhotoVideos = livePhotoVideos;
        filterLivePhotos = livePhotos;
        filterTrash = trash;
        filterAll = (!filterVideos && !filterFavorites && !filterLivePhotoVideos && !filterLivePhotos && !filterPhotos);
        setCookie('mphotos-filterPhotos', filterPhotos.toString());
        setCookie('mphotos-filterVideos', filterVideos.toString());
        setCookie('mphotos-filterFavorites', filterFavorites.toString());
        setCookie('mphotos-filterLivePhotoVideos', filterLivePhotoVideos.toString());
        setCookie('mphotos-filterLivePhotos', filterLivePhotos.toString());
    }

    const togglePlayLivePhotos = () => {
        playLivePhotos = !playLivePhotos;
        if (!playLivePhotos) {
            activeVideoGuids = [];
        }
        else if (playLivePhotos && activeVideoGuids.length == 0)
        {
            onScrollSettled(currentStartPhotoIndex, currentEndPhotoIndex);
        }
        setCookie('mphotos-playLivePhotos', playLivePhotos.toString());
    }
</script>

{#if isPhotoModalOpen}
    <PhotoSlider photos={filteredPhotosMetadata} photoIndex={currentPhotoIndex} closeModal={handleClosePhotoSlider} nrToPreload={2}/>
{/if}
<Options
    photos={filteredPhotosMetadata}
    currentChunkSize={chunkSize}
    maxChunkSize={maxChunkSize}
    minChunkSize={minChunkSize}
    sortedPhotosCallback={(sortedPhotos) => {
        filteredPhotosMetadata = sortedPhotos;
        setChunkedPhotos();
    }}
    zoomInCallback={() => {
        zoomIn();
    }}
    zoomOutCallback={() => {
        zoomOut();
    }}
    toggleSquareProportionsCallback={() => {
        showSquareThumbs = !showSquareThumbs;
        calcRowHeights(showSquareThumbs);
        setCookie('mphotos-squareProportions', showSquareThumbs.toString());
    }}
    closeFromParent={closeAllModalsFromParent}
    isVideoFiltered={filterVideos}
    isFavoriteFiltered={filterFavorites}
    isShowingAll={filterAll}
    arePhotosSquare={showSquareThumbs}
    isLivePhotoVideosFiltered={filterLivePhotoVideos}
    isPhotosFiltered={filterPhotos}
    isLivePhotosFiltered={filterLivePhotos}
    playLivePhotos={playLivePhotos}
    togglePlayLivePhotosCallback={() => {
        togglePlayLivePhotos();
    }}
/>
<DatePicker 
    photos={filteredPhotosMetadata} 
    photoIndex={datepickerIndex} 
    chunkSize={chunkSize}
    on:setScroll={(e) => {scrollToIndex = Math.floor(e.detail / chunkSize)}}
    closeFromParent={closeAllModalsFromParent}
/>
<div class="text-rounded-corners nr-of-photos">
    <p>{currentNoPhotos}</p>
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
            on:afterScroll={handleCloseAllModals}
            {scrollToIndex}
            >

        <div slot="item" let:index let:style {style}>
            <table style="width: 100%; height: 100%; table-layout: fixed;">
                <tbody>
                    <tr style="text-align:center;">
                        {#each chunkedPhotos[index] as currentPhotoMeta, itemIndex}
                            <td style="">
                                <a on:click={() => openModal(currentPhotoMeta, index*chunkSize + itemIndex)} href='/'>
                                    <div style="position: relative; display: inline-block;">
                                        {#if playLivePhotos && currentPhotoMeta.sidecarGuid && !isScrolling && activeVideoGuids.includes(currentPhotoMeta.guid)}
                                            <video 
                                            muted autoplay loop playsinline preload="none"
                                            src="api/video/{currentPhotoMeta.sidecarGuid}/loop"
                                            class:square-thumb={showSquareThumbs}
                                            style="--row-height: {rowHeights[index]-2}px; background: url('api/photos/{currentPhotoMeta.guid}/thumb') center/contain no-repeat;"
                                            />
                                        {:else}
                                            <img 
                                            id={currentPhotoMeta.guid}
                                            src="api/photos/{currentPhotoMeta.guid}/thumb"
                                            alt={currentPhotoMeta.dateTaken}
                                            class:square-thumb={showSquareThumbs}
                                            style="--row-height: {rowHeights[index]-2}px;"
                                            >
                                        {/if}
                                        {#if currentPhotoMeta.type === 'video' || currentPhotoMeta.type === 'live-photo-video'}
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
                    filterPhotosArray(); }} 
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
                    filterPhotosArray(); }}
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
                    filterPhotosArray(); 
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
        top: 85px; 
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