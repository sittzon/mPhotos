import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery'
// import PhotoSwipeLightbox from 'photoswipe/lightbox';
import { FixedSizeList, VariableSizeList } from 'react-window';
import AutoSizer from "react-virtualized-auto-sizer";
// import useScreenSize from '../useScreenSize';
import TopItems from './TopItems';
import MLightbox from './MLightbox';
import 'photoswipe/dist/photoswipe.css'
import Cookies from 'universal-cookie';
import './Home.css';

const VirtualHome = () => {
  // The 'useState' hook (function) returns a getter (variable) & setter (function) for your state value
  // and takes the initial/default value for it/to set it to, e.g.
  const [ columns, setColumns ] = useState(5);
  const [ allMetaData, setAllMetaData ] = useState([]);
  const [ currentMetaData, setCurrentMetaData ] = useState([]);
  const [ metaGroupBy3, setMetaGroupBy3 ] = useState([]);
  const [ metaGroupBy5, setMetaGroupBy5 ] = useState([]);
  const [ metaGroupBy7, setMetaGroupBy7 ] = useState([]);
  const [ sortOrder, setSortOrder ] = useState(true);
  const [ metaCurrentDate, setmetaCurrentDate ] = useState('0');
  const [ metaCurrentYear, setmetaCurrentYear ] = useState('0');
  const [ metaCurrentMonth, setmetaCurrentMonth ] = useState('0');

  const months = [ "January", "February", "March", "April", "May", "June", 
           "July", "August", "September", "October", "November", "December" ];

  const cookies = new Cookies();
  
  // Empty dependency array -> Only run on component mount
  useEffect(() => { 
    populateData();
    
    const cookieColumns = cookies.get('columns');
    if (cookieColumns) {
      setColumns(cookieColumns);
    }
    
  }, []);
  
  const allMetaDataRef = useRef(allMetaData);
  const currentMetaDataRef = useRef(currentMetaData);
  useEffect(() => {
    allMetaDataRef.current = allMetaData;
  }, [allMetaData]);
  
  useEffect(() => {
    currentMetaDataRef.current = currentMetaData;
  }, [currentMetaData]);


  const handleScroll = async (event) => {
    if (allMetaDataRef.current.length === 0) {
      return;
    }

    // Get scroll percent of page
    const percentScroll = scrollPercent();
    // Convert to index in array
    const index = Math.max(0, Math.floor(percentScroll * allMetaDataRef.current.length) - 1);
    // Get dateTaken of index image
    let currentDate = allMetaDataRef.current[index].dateTaken;
    // console.log(percentScroll + " -> " + index + " -> " + currentDate);
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);
  };

  const scrollPercent = () => {
    const currentHeight = document.querySelector('#gallery div div').style['height'];
    const rowHeight = getItemSize();
    const rowCount = groupByN(columns, allMetaData).length;
    const totalHeight = rowHeight * rowCount;

    return parseInt(currentHeight) / parseInt(totalHeight);
  }

  const groupByN = (n, arr) => {
    let result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
  };
  
  const populateData = async () => {
    const response = await fetch('photos/metadata');
    const metaData = await response.json();
    
    let currentDate = metaData[0].dateTaken;
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);
    
    setMetaGroupBy3(groupByN(3, metaData));
    setMetaGroupBy5(groupByN(5, metaData));
    setMetaGroupBy7(groupByN(7, metaData));
    setAllMetaData(metaData);
    setCurrentMetaData(metaGroupBy3);
  };

  const toggleColumns = () => {
    const columnsNew = columns === 3? 5 : (columns === 5? 7 : 3);
    setColumns(columnsNew);
    setCurrentMetaData(columnsNew === 3? metaGroupBy3 : (columnsNew === 5? metaGroupBy5 : metaGroupBy7));
    cookies.set('columns', columnsNew, { path: '/' });
  };
  
  const sortByDate = () => {
    let sortedMetaData = [...allMetaData].sort((a, b) => {
      if (sortOrder) {
        return a.dateTaken > b.dateTaken
      } else {
        return a.dateTaken < b.dateTaken
      }
    });
    // TODO: fix this
    // setAllMetaData(sortedMetaData);
    // setCurrentMetaData(sortedMetaData);
    setSortOrder(!sortOrder);
  };

  const filterByDates = () => {
    const filterStartDate = document.querySelector('#filterStartDate');
    const filterEndDate = document.querySelector('#filterEndDate');

    // Get metadata index of filterStartDate & filterEndDate
    const startIndex = allMetaData.findIndex((photo) => {
      return photo.dateTaken.split('T').shift() > filterStartDate.value;
    });
    const endIndex = allMetaData.findIndex((photo) => {
      return photo.dateTaken.split('T').shift() >= filterEndDate.value;
    });
    // console.log(filterStartDate.value);
    // console.log(filterEndDate.value);
    console.log(startIndex);
    console.log(endIndex);

    TopItems.startDate = filterStartDate.value;
    
    // TODO: fix this
    setAllMetaData(allMetaData.slice(startIndex, endIndex));
    // To index in array
    const index = 0;
    let currentDate = allMetaDataRef.current[index].dateTaken;
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);
  }

  const imageClicked = (id, index, caption) => {
    const evt = new CustomEvent('img-clicked', { detail: {id: id, index: index, caption: caption}}); 
    window.dispatchEvent(evt);
  };

  const Row = ({ index, style }) => {
    const rowStyle = {
      ...style,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 8px',
    };

    let allImgColumnIndex = [0,1,2,3,4,5,6];
    return (
      <div style={rowStyle}>
          {allImgColumnIndex.map((i) => {
            return(
              i < columns && index*columns + i < allMetaData.length &&
              <img 
                key={index*columns+i} 
                id={allMetaData[index*columns+i].guid} 
                src={"photos/" + allMetaData[index*columns+i].guid + "/thumb"} 
                alt={
                  allMetaData[index*columns+i].dateTaken + " - " + 
                  allMetaData[index*columns+i].name + " - " + 
                  allMetaData[index*columns+i].width + "x" + allMetaData[index*columns+i].height + " - " + 
                  allMetaData[index*columns+i].sizeKb + "kB"}
                style={{ maxWidth: (90.0 / columns)+'%', display: 'flex', justifyContent: 'center'}}
                onClick={(event) => {
                  imageClicked(allMetaData[index*columns+i].guid, index*columns+i, event.target.alt);
                }}
              />
            )
          })}
      </div>
    )
  };

  const getItemSize = index => {
    const defaultValue = 220;
    const totalWidth = window.screen.width;
    if (!totalWidth) {
      return defaultValue;
    }
    const imgWidth = (totalWidth - 10*(columns+1)) / columns; //10px padding
    if (!imgWidth) {
      return defaultValue;
    }
    const imgHeight = imgWidth * 1.5; // Maximum 3:2 aspect ratio
    if (!imgHeight) {
      return defaultValue;
    }

    // console.log('imgHeight: ' + imgHeight);
    return Math.min(imgHeight, defaultValue);
  };

  return (
    <>
      <TopItems 
        toggleColumns={toggleColumns} 
        sortByDate={sortByDate} 
        filterByDates={filterByDates} 
        noPhotos={allMetaData.length} 
        startDate={metaCurrentDate}
      />
      <h2 className="text-rounded-corners fixed" style={{top:'55px', marginLeft: "10px"}}>
        {months[+metaCurrentMonth - 1]} {metaCurrentYear} 
      </h2>

      <AutoSizer id="gallery">
        {({ height, width }) => (
          <VariableSizeList 
            height={height} 
            width={width} 
            itemSize={getItemSize} 
            itemCount={groupByN(columns, allMetaData).length}
            onScroll={handleScroll}
          >
            {Row}
          </VariableSizeList>
        )}
      </AutoSizer>

      <MLightbox
        metaData={allMetaData}
      />
      </>
  );
};

export default VirtualHome;