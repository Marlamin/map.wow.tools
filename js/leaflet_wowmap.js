/* global google:false */
(function()
{
    var LeafletMap = InitializeMap();
    var TileLayer;
    var Minimap;
    var MinimapLayer;
    var ADTGridLayer;
    var ADTGridTextLayer;
    var DiffLayer;
    var Manifest;
    var Elements =
    {
        Maps: document.getElementById( 'js-map-select' ),
        Versions: document.getElementById( 'js-version-select' ),
        PrevMap: document.getElementById( 'js-version-prev' ),
        NextMap: document.getElementById( 'js-version-next' ),
        Sidebar: document.getElementById( 'js-sidebar' ),
        Map: document.getElementById( 'js-map' ),
        TechBox: document.getElementById( 'js-techbox' ),
        Layers: document.getElementById('js-layers'),
        ADTGrid: document.getElementById('js-adtgrid'),
        DiffVersions: document.getElementById('js-diffversions'),
    };

    var Current =
    {
        Map: false,
        InternalMap: false,
        InternalMapID: false,
        Version: 0,
        wdtFileDataID: 0
    };

    var maxSize = 51200 / 3; 		//17066,66666666667
    var mapSize = maxSize * 2; 		//34133,33333333333
    var adtSize = mapSize / 64; 	//533,3333333333333

    // Sidebar button
    document.getElementById( 'js-sidebar-button' ).addEventListener( 'click', function( )
    {
        Elements.Sidebar.classList.toggle( 'closed' );
        document.getElementById( 'js-sidebar-button' ).classList.toggle( 'closed' );
    } );

    // Layer button
    document.getElementById( 'js-layers-button' ).addEventListener( 'click', function( )
    {
        Elements.Layers.classList.toggle( 'closed' );
    } );

    var d;
    var isDebug = window.location.hash === '#debug';

    if ( isDebug )
    {
        var debugEl = document.createElement( 'pre' );
        debugEl.style.zIndex = 1337;
        debugEl.style.color = '#FFF';
        debugEl.style.position = 'absolute';
        debugEl.style.bottom = '80px';
        debugEl.style.left = '5px';
        debugEl.style.maxHeight = '475px';
        debugEl.style.overflowY = 'hidden';
        debugEl.style.backgroundColor = 'rgba(0, 0, 0, .5)';

        document.body.appendChild( debugEl );

        d = function(text) { debugEl.textContent = text + "\n" + debugEl.textContent; };
    }
    else
    {
        d = function(text) { console.log(text); };
    }

    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = Initialize;
    xhr.open( 'GET', 'data/manifest_v2.json?v=8', true );
    xhr.responseType = 'json';
    xhr.send();

    function Initialize()
    {
        if ( xhr.readyState !== 4 )
        {
            return;
        }

        d( 'JSON data loaded: ' + xhr.status );

        if ( xhr.status !== 200 || !xhr.response.Maps )
        {
            alert( 'Failed to load JSON data. Whoops.' );

            return;
        }

        Manifest = xhr.response;

        InitializeMapOptions();
        InitializeEvents();
    }

    function InitializeMap()
    {
        return new L.map('js-map', {
            center: [0, 0],
            zoom: 1,
            minZoom: 2,
            maxZoom: 7,
            crs: L.CRS.Simple,
            zoomControl: false,
            preferCanvas: true,
            worldCopyJump: false
        });
    }

    function InitializeMapOptions()
    {
        var params = new URLSearchParams(document.location.search);
        var option, fragment = document.createDocumentFragment();

        var urlMap = decodeURIComponent(params.get("map"));

        for (const [mapID, map] of Object.entries(Manifest.Maps)) {
            option = document.createElement( 'option' );
            option.dataset.internal = map.InternalName;
            option.dataset.imapid = map.InternalMapID;
            option.dataset.wdtfiledataid = map.WDTFileDataID;
            option.value = mapID;
            option.textContent = map.Name;
            fragment.appendChild( option );

            // Either first map, or specified map
            if ( !Current.Map || (urlMap != null && map.InternalName === urlMap) )
            {
                d( 'Using ' + map.InternalName + ' as map' );

                Current.Map = mapID;
                Current.InternalMap = map.InternalName;
                Current.InternalMapID = map.InternalMapID;
                Current.wdtFileDataID = map.WDTFileDataID;
                Current.Version = '' + parseInt( params.get("v"), 10 );
                option.selected = map.InternalName === urlMap;
            }
        };

        Elements.Maps.appendChild( fragment );

        UpdateMapVersions();

        d( 'Initialized map ' + Current.Map + ' on version ' + Current.Version );

        // Get zoom level, from url or fallback to default
        var zoom = parseInt( params.get("z"), 10 ) || 0;

        var urlSet = false;

        // Get map coordinates
        if (parseFloat(params.get("lat")) && parseFloat( params.get("lng") ) ){
            var latlng = new L.LatLng( params.get("lat"), parseFloat( params.get("lng")) );
        }

        // Fallback to map default if needed
        if ( !latlng || (isNaN( latlng.lat ) || isNaN( latlng.lng ) ) )
        {
            d('Falling back to center?');
            latlng = new L.LatLng(
                0,0
            );
        } else {
            urlSet = true;
        }

        RenderMap( latlng, zoom, true, urlSet);
    }

    function wowMapMatcher(params, data) {
        // If there are no search terms, return all of the data
        if ($.trim(params.term) === '') {
            return data;
        }

        // Do not display the item if there is no 'text' property
        if (typeof data.text === 'undefined') {
            return null;
        }

        if (data.text.toLowerCase().indexOf(params.term.toLowerCase()) > -1) {
            var modifiedData = $.extend({}, data, true);
            return modifiedData;
        }

        if (data.element.dataset.internal.toLowerCase().indexOf(params.term.toLowerCase()) > -1) {
            var modifiedData = $.extend({}, data, true);
            modifiedData.text += ' (Internal match)';
            return modifiedData;
        }

        if (data.element.dataset.imapid != null && data.element.dataset.imapid == params.term){
            var modifiedData = $.extend({}, data, true);
            modifiedData.text += ' (MapID match)';
            return modifiedData;
        }

        return null;
    }

    function UpdateMapVersions()
    {
        var element,
            sortable = [],
            fragment = document.createDocumentFragment();

        // Turn versions object into a list so that it can be sorted
        Object.keys( Manifest.MapVersions[ Current.Map ] ).forEach( function( versionId )
        {
            element = Manifest.MapVersions[ Current.Map ][ versionId ];
            element.version = versionId;

            element.branch = Manifest.Versions[ versionId ].Branch;
            element.build = Manifest.Versions[ versionId ].Build;
            element.fullbuild = Manifest.Versions[ versionId ].FullBuild;
            sortable.push( element );
        } );

        sortable
            // Sort versions by build
            .sort( function( a, b )
            {
                if ( a.build === b.build )
                {
                    return 0;
                }

                return a.build > b.build ? -1 : 1;
            } )
            // Append each version
            .forEach( function( version )
            {
                element = document.createElement( 'option' );
                element.value = version.version;

                // If we switch to another map, and current version is present in that map, select it
                if ( version.version === Current.Version )
                {
                    element.selected = true;
                }

                if ( version.branch != undefined && version.branch.length > 0 )
                {
                    element.textContent = version.fullbuild + ' (' + version.branch + ')';
                }
                else
                {
                    element.textContent = version.fullbuild;
                }

                fragment.appendChild( element );
            } );

        const clone = fragment.cloneNode(true);

        Elements.Versions.innerHTML = '';
        Elements.Versions.appendChild( fragment );

        var noDiffOption = document.createElement('option');
        noDiffOption.value = 0;
        noDiffOption.textContent = 'None';
        clone.prepend(noDiffOption);

        Elements.DiffVersions.innerHTML = ''
        Elements.DiffVersions.appendChild( clone );
        
        // If current version is not valid for this map, reset it
        if ( !Manifest.MapVersions[ Current.Map ][ Current.Version ] )
        {
            d( 'Using first version' );

            Current.Version = Elements.Versions.firstChild.value;
        }

        UpdateArrowButtons();
    }

    function UpdateArrowButtons()
    {
        var element = Elements.Versions.options[ Elements.Versions.selectedIndex ];

        // Enable or disable arrow keys as necessary
        Elements.PrevMap.disabled = element.nextSibling === null;
        Elements.NextMap.disabled = element.previousSibling === null;
    }

    function InitializeEvents()
    {
        var select2El = $("#js-map-select").select2({ matcher: wowMapMatcher, disabled: false });
        Elements.MapSelect2 = select2El;
        Elements.MapSelect2.on( 'change', function(e)
        {
            d( '[SELECT2] Changed map to ' + this.value + ' from ' + Current.Map );

            Current.Map = this.value;
            Current.InternalMap = this.options[ this.selectedIndex ].dataset.internal;
            Current.InternalMapID = this.options[ this.selectedIndex ].dataset.imapid;
            Current.wdtFileDataID = this.options[ this.selectedIndex ].dataset.wdtfiledataid;
            UpdateMapVersions();

            RenderMap(
                LeafletMap.unproject(
                    [
                        Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.ResY / 2,
                        Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.ResX / 2
                    ], Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom)
                , 2, true, false
            );
        } );

        Elements.Versions.addEventListener( 'change', ChangeVersion );

        Elements.DiffVersions.addEventListener( 'change', ChangeDiffVersion );

        Elements.PrevMap.addEventListener( 'click', function( )
        {
            Elements.Versions.selectedIndex = Elements.Versions.selectedIndex + 1;

            ChangeVersion();
        } );

        Elements.NextMap.addEventListener( 'click', function( )
        {
            Elements.Versions.selectedIndex = Elements.Versions.selectedIndex - 1;

            ChangeVersion();
        } );

        Elements.ADTGrid.addEventListener( 'click', function( )
        {
            if (Elements.ADTGrid.checked){
                d('Enabled ADT grid');
                ADTGridLayer = new L.LayerGroup();
                ADTGridTextLayer = new L.LayerGroup();
                for (var x = 0; x < 64; x++){
                    for (var y = 0; y < 64; y++){
                        var fromlat = WoWtoLatLng(maxSize - (x * adtSize), -maxSize);
                        var tolat = WoWtoLatLng(maxSize - (x * adtSize), maxSize);
                        ADTGridLayer.addLayer(new L.polyline([fromlat, tolat], {weight: 0.1, color: 'red'}));

                        var fromlat = WoWtoLatLng(maxSize, maxSize - (x * adtSize));
                        var tolat = WoWtoLatLng(-maxSize , maxSize - (x * adtSize));
                        ADTGridLayer.addLayer(new L.polyline([fromlat, tolat], {weight: 0.1, color: 'red'}));
                    }
                }
                refreshADTGrid();
                ADTGridLayer.addTo(LeafletMap);
            } else {
                d('Disabled ADT grid')
                LeafletMap.removeLayer(ADTGridLayer);
                LeafletMap.removeLayer(ADTGridTextLayer);
            }
        } );

        LeafletMap.on('moveend zoomend dragend', function()
        {
            SynchronizeTitleAndURL();
            if (Elements.ADTGrid.checked){
                refreshADTGrid();
            }
        } );

        LeafletMap.on('click', function(e)
        {
            ProcessOffsetClick(e, Manifest.MapVersions[Current.Map][Current.Version].Config);
        } );

        Elements.Maps.disabled = false;
        Elements.Versions.disabled = false;
    }

    function refreshADTGrid(){
        var drawing = 0;

        for (var x = 0; x < 64; x++){
            for (var y = 0; y < 64; y++){
                var latlng = WoWtoLatLng(maxSize - (x * adtSize) - 25, maxSize - (y * adtSize) - 25);
                if (LeafletMap.getBounds().contains(latlng)){
                    drawing++;
                }
            }
        }

        if(drawing > 500)
        {
            LeafletMap.removeLayer(ADTGridTextLayer);
            return;
        }

        LeafletMap.removeLayer(ADTGridTextLayer);
        ADTGridTextLayer = new L.LayerGroup();
        for (var x = 0; x < 64; x++){
            for (var y = 0; y < 64; y++){
                var latlng = WoWtoLatLng(maxSize - (x * adtSize) - 25, maxSize - (y * adtSize) - 25);
                if (LeafletMap.getBounds().contains(latlng)){
                    var myIcon = L.divIcon({className: 'adtcoordicon', html: '<div class="adtcoord">' + y + '_' + x + '</div>'});
                    ADTGridTextLayer.addLayer(new L.marker(latlng, {icon: myIcon}));
                }
            }
        }

        d( 'Refreshed ADT grid, drawing ' + drawing + ' coordinate boxes');
        LeafletMap.addLayer(ADTGridTextLayer);
    }

    function RequestOffset(){
        d('Requesting offset');
        document.getElementById("clickedADT").textContent = "Loading..";
        document.getElementById("clickedCoord").textContent = "Loading..";
        var offsapixhr = new XMLHttpRequest();
        offsapixhr.responseType = 'json';
        offsapixhr.onreadystatechange = function() {
            if (offsapixhr.readyState === 4){
                if ('x' in offsapixhr.response){
                    offset = offsapixhr.response;
                    ProcessOffsetResult(offset);
                    document.getElementById("clickedADT").textContent = "Ready for click";
                    document.getElementById("clickedCoord").textContent = "Ready for click";
                } else {
                    document.getElementById("clickedADT").textContent = "Not supported on map.";
                    document.getElementById("clickedCoord").textContent = "Not supported on map.";
                }
            }
        }

        offsapixhr.open( 'GET', '/maps/api.php?type=offset&build=' + Versions[Current.Map][Current.Version].build + '&map=' + Current.InternalMap, true );
        offsapixhr.send();
    }

    function ProcessOffsetResult(offset){
        d('Processed new offset ' + offset.x +' ' + offset.y);
        var build = Versions[Current.Map][Current.Version].build;

        Versions[Current.Map][Current.Version].config.offset.min = offset;

        Elements.ADTGrid.disabled = false;
    }

    function ProcessOffsetClick(e, offset){
        if (Manifest.MapVersions[Current.Map][Current.Version].Config.MinX == -1 || Manifest.MapVersions[Current.Map][Current.Version].Config.MinY == -1){
            document.getElementById("clickedCoord").textContent = "Not supported on map";
            document.getElementById("clickedADT").textContent = "Not supported on map";
            return;
        }

        var layerPoint = LeafletMap.project(e.latlng, Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom).floor();
        var build = Manifest.Versions[Current.Version].Build;
        var adt = PointToWoWTile(layerPoint, offset, build);
        var ingame = PointToWoW(layerPoint, offset, build);
        let zPos = 200;
        if (Current.InternalMapID == 2222){
            zPos = 5000;
        }
        document.getElementById("clickedCoord").textContent =  Math.floor(ingame.x) + ' ' + Math.floor(ingame.y) + ' ' + zPos + ' ' + Current.InternalMapID;
        document.getElementById("clickedADT").textContent = Current.InternalMap + '_' + adt.x + '_' + adt.y;
    }

    function WoWtoLatLng( x, y ){
        var pxPerCoord = adtSize / 512; //1.04

        if (Manifest.MapVersions[Current.Map][Current.Version].Config.MinX == 63){
            d("Cannot do latlng lookup, no valid offset!");
            return;
        }

        var offsetX = (Manifest.MapVersions[Current.Map][Current.Version].Config.MinX * adtSize) / pxPerCoord;
        var offsetY = (Manifest.MapVersions[Current.Map][Current.Version].Config.MinY * adtSize) / pxPerCoord;

        var tempx = y * -1; //flip it (°□°）︵ ┻━┻)
        var tempx = (mapSize / 2 + tempx) / pxPerCoord - offsetX;
        var tempy = x * -1; //flip it (°□°）︵ ┻━┻)
        var tempy = (mapSize / 2 + tempy) / pxPerCoord - offsetY;
        return LeafletMap.unproject([tempx, tempy], Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom);
    }

    function LatLngToWoW( latlng ){
        return PointToWoW(LeafletMap.project(latlng, Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom), Manifest.MapVersions[Current.Map][Current.Version].Config);
    }

    function PointToWoW( point, offset, build ){
        var tileSize = 512;

        var adtsToCenterX = ((point.y / tileSize) + offset.MinY) - 32;
        var adtsToCenterY = ((point.x / tileSize) + offset.MinX) - 32;

        var ingameX = -(adtsToCenterX * adtSize); // (╯°□°）╯︵ ┻━┻
        var ingameY = -(adtsToCenterY * adtSize); // (╯°□°）╯︵ ┻━┻

        return new L.Point(ingameX, ingameY);
    }

    function PointToWoWTile( point, offset, build ){
        var tileSize = 512;
        var adtX = Math.floor((point.x / tileSize) + offset.MinX);
        var adtY = Math.floor((point.y / tileSize) + offset.MinY);

        return new L.Point(adtX, adtY);
    }

    function WoWTileAndCoordToMCNK(adt, ingame){
        var tileBaseY = -(adt.x - 32) * adtSize;
        var tileBaseX = -(adt.y - 32) * adtSize;

        return mcnkIndex = Math.floor((tileBaseX - ingame.x) / (adtSize / 16)) + 16 * Math.floor((tileBaseY - ingame.y) / (adtSize / 16));
    }

    function ChangeVersion()
    {
        d( 'Changed version to ' + Elements.Versions.value + ' from ' + Current.Version );

        var offsetBeforeX = Manifest.MapVersions[Current.Map][Current.Version].Config.MinX;
        var offsetBeforeY = Manifest.MapVersions[Current.Map][Current.Version].Config.MinY;

        var center = LeafletMap.getCenter();
        Elements.ADTGrid.checked = false;

        if(DiffLayer !== undefined && LeafletMap.hasLayer(DiffLayer))
            LeafletMap.removeLayer(DiffLayer);

        if(ADTGridLayer !== undefined && LeafletMap.hasLayer(ADTGridLayer))
            LeafletMap.removeLayer(ADTGridLayer);

        if(ADTGridTextLayer !== undefined && LeafletMap.hasLayer(ADTGridTextLayer))
            LeafletMap.removeLayer(ADTGridTextLayer);

        Elements.DiffVersions.value = 0;

        if (isDebug){
            // Don't support offset adjustments when offset is initially unknown
            var offsetAfterX = Manifest.MapVersions[Current.Map][Elements.Versions.value].Config.MinX;
            var offsetAfterY = Manifest.MapVersions[Current.Map][Elements.Versions.value].Config.MinY;

            d( 'Offset before: ' + offsetBeforeX + '_' + offsetBeforeY + ', after: ' + offsetAfterX + '_' + offsetAfterY);

            if (offsetBeforeX != offsetAfterX || offsetBeforeY != offsetAfterY){
                d( 'Offset differs, map adjustment needed' );
                if (offsetBeforeX != 63 && offsetAfterX != 63){
                    // get current map loc and convert to wow
                    var wowCenter = LatLngToWoW(center);
                    d ('Current map center: ' + center.lat + ' ' + center.lng);
                    d ('Current wow center: ' + wowCenter.x + ' ' + wowCenter.y);
                    var newCenter = wowCenter;

                    // calculate offset... offset?
                    if (offsetBeforeX > offsetAfterX){
                        // Positive x
                        var offsetX = offsetBeforeX - offsetAfterX;
                        newCenter.x -= offsetX * adtSize;
                    } else if (offsetBeforeX < offsetAfterX){
                        // Negative x
                        var offsetX = offsetAfterX - offsetBeforeX;
                        newCenter.x += offsetX * adtSize;
                    }

                    if (offsetBeforeY > offsetAfterY){
                        // Positive y
                        var offsetY = offsetBeforeY - offsetAfterY;
                        newCenter.y -= offsetY * adtSize;
                    } else if (offsetBeforeY < offsetAfterY){
                        // Negative y
                        var offsetY = offsetAfterY - offsetBeforeY;
                        newCenter.y += offsetY * adtSize;
                    }

                    if (Number.isNaN(newCenter.x) || Number. isNaN(newCenter.y)){
                        center = LeafletMap.getCenter();
                    } else {
                        d ('New wow center: ' + newCenter.x + ' ' + newCenter.y);

                        center = WoWtoLatLng(newCenter.x, newCenter.y);

                        // bug?
                        center.lat = center.lat / 2;
                        center.lng = center.lng / 2;

                        d ('New map center: ' + center.lat + ' ' + center.lng);

                        // use old center for now
                        if (!isDebug){
                            center = LeafletMap.getCenter();
                        }
                    }
                } else {
                    d( 'One of the offsets is unknown, not applying changes' );
                }
            }
        }

        Current.Version = Elements.Versions.value;

        RenderMap(center, LeafletMap.getZoom(), false, true);

        UpdateArrowButtons();

        SynchronizeTitleAndURL();
    }

    async function ChangeDiffVersion(){
        d('Changed diff version to ' + Elements.DiffVersions.value + ' from ' + Current.Version);

        if(Elements.DiffVersions.value == 0 || (Elements.DiffVersions.value == Current.Version))
            return;

        var currentVersionHash = Manifest.MapVersions[ Current.Map ][ Current.Version ].MD5;
        var otherVersionHash = Manifest.MapVersions[ Current.Map ][ Elements.DiffVersions.value ].MD5;

        // async fetch https://tiles.wow.tools/tiles/ currentVersionHash /maps/Azeroth.json

        var fetchCurrent = await fetch('https://tiles.wow.tools/tiles/' + currentVersionHash + '/maps/' + Current.InternalMap + '.json').then(response => response.json());
        var fetchOther = await fetch('https://tiles.wow.tools/tiles/' + otherVersionHash + '/maps/' + Current.InternalMap + '.json').then(response => response.json());

        console.log(fetchCurrent);
        var currentTiles = fetchCurrent.TileHashes;
        var otherTiles = fetchOther.TileHashes;

        console.log(currentTiles);
        console.log(otherTiles);

        var diffTiles = [];

        for (var x = 0; x < 64; x++){
            for (var y = 0; y < 64; y++){
                if (currentTiles[x][y] != otherTiles[x][y]){
                    diffTiles.push({x: x, y: y});
                }
            }
        }

        if (DiffLayer != undefined && LeafletMap.hasLayer(DiffLayer)){ LeafletMap.removeLayer(DiffLayer); }

        DiffLayer = new L.LayerGroup();

        // draw rectangle around each changed tile
        for (var i = 0; i < diffTiles.length; i++){
            var x = diffTiles[i].y;
            var y = diffTiles[i].x;

            var fromlat = WoWtoLatLng(maxSize - (x * adtSize), maxSize - (y * adtSize));
            var tolat = WoWtoLatLng(maxSize - ((x + 1) * adtSize), maxSize - ((y + 1) * adtSize));

            var rectangle = L.rectangle([fromlat, tolat], {color: 'red', weight: 1});
            rectangle.addTo(DiffLayer);
        }

        DiffLayer.addTo(LeafletMap);

        console.log(diffTiles);
    }


    function RenderMap( center, zoom, isMapChange, urlSet )
    {
        var name = 'WoW_' + Current.Map + '_' + Current.Version;

        d( 'Loading map ' + name );

        LeafletMap.options.maxZoom = 10;

        var mapbounds = new L.LatLngBounds(LeafletMap.unproject([1, Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.ResY - 1], Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom), LeafletMap.unproject([Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.ResX - 1, 1], Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom));

        if (TileLayer){
            LeafletMap.removeLayer(TileLayer);
        }

        var fixedCaseMapName = Current.InternalMap;
        if(Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.isLowerCase)
            fixedCaseMapName = fixedCaseMapName.toLowerCase();

        TileLayer = new L.tileLayer("https://tiles.wow.tools/tiles/" + Manifest.MapVersions[ Current.Map ][ Current.Version ].MD5 + "/tiles/" + fixedCaseMapName + "/{z}/{y}/{x}.png", {
            attribution: '<!--<a href="https://old.wow.tools/maps/list.php" title="Raw PNGs used to generate tiles for this viewer">Raw images</a> | -->By <a href="https://bsky.app/profile/marlam.in" target="_BLANK">Marlamin</a> | &copy; Blizzard Entertainment',
            bounds: mapbounds,
            maxNativeZoom : Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom,
            maxZoom: 12
        }).addTo(LeafletMap);

        if (!center){
            var center = LeafletMap.getCenter();
        }

        if (!zoom){
            var zoom = LeafletMap.getZoom();
        }

        MinimapLayer = new L.TileLayer("https://tiles.wow.tools/tiles/" + Manifest.MapVersions[ Current.Map ][ Current.Version ].MD5 + "/tiles/" + fixedCaseMapName + "/{z}/{y}/{x}.png", {minZoom: 2, maxZoom: 2, continuousWorld: true, bounds: mapbounds});
        if (Minimap){
            Minimap.changeLayer(MinimapLayer);
        } else {
            Minimap = new L.Control.MiniMap(MinimapLayer, {toggleDisplay: true, zoomLevelFixed: 1, autoToggleDisplay: true}).addTo(LeafletMap);
        }

        SetMapCenterAndZoom( center, zoom, isMapChange, urlSet );

        if (isMapChange){
            document.getElementById("clickedCoord").textContent = "No click. :(";
            document.getElementById("clickedADT").textContent = "No click. :(";
        }

        Elements.ADTGrid.checked = false;
        Elements.ADTGrid.disabled = true;

        if (Manifest.MapVersions[Current.Map][Current.Version].Config.MinX != 63){
            Elements.ADTGrid.disabled = false;
        }

        if (ADTGridLayer != undefined && LeafletMap.hasLayer(ADTGridLayer)){ LeafletMap.removeLayer(ADTGridLayer); }
        if (ADTGridTextLayer != undefined &&  LeafletMap.hasLayer(ADTGridTextLayer)){ LeafletMap.removeLayer(ADTGridTextLayer); }
        if (DiffLayer != undefined &&  LeafletMap.hasLayer(DiffLayer)){ LeafletMap.removeLayer(DiffLayer); }
 
        ADTGridTextLayer = new L.LayerGroup();
        DiffLayer = new L.LayerGroup();
    }

    function SetMapCenterAndZoom( center, zoom, isMapChange, urlSet )
    {
        d("Setting center " + center + " and zoom " + zoom);

        LeafletMap.setView( center , zoom , {animate: false} );

        if (!urlSet)
        {
            d('Fitting map!');
            var mapbounds = new L.LatLngBounds(LeafletMap.unproject([1, Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.ResY - 1], Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom), LeafletMap.unproject([Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.ResX - 1, 1], Manifest.MapVersions[ Current.Map ][ Current.Version ].Config.MaxZoom));
            LeafletMap.fitBounds(mapbounds);
        }
    }

    function SynchronizeTitleAndURL( isMapChange )
    {
        var latlng = LeafletMap.getCenter();

        var zoom = LeafletMap.getZoom();

        var current =
        {
            Zoom: zoom,
            LatLng: latlng,
            Current: Current
        };

        var title = Elements.Maps.options[ Elements.Maps.selectedIndex ].textContent + ' · ' + Manifest.Versions[Current.Version].FullBuild + ' · Wow Minimap Browser';

        var url = '?map=' + Current.InternalMap + '&v=' + Current.Version + '&z=' + zoom + '&lat=' + latlng.lat.toFixed(3) + '&lng=' + latlng.lng.toFixed(3);

        if (isDebug){
            url += "#debug";
        }

        if ( isMapChange )
        {
            window.history.pushState( current, title, url );
        }
        else
        {
            window.history.replaceState( current, title, url );
        }

        document.title = title;

        d( 'URL: ' + url + ' (map change: ' + !!isMapChange + ')' );
    }
}());
