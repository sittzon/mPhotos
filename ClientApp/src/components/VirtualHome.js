import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery'
// import PhotoSwipeLightbox from 'photoswipe/lightbox';
import { FixedSizeList, VariableSizeList } from 'react-window';
import AutoSizer from "react-virtualized-auto-sizer";
// import useScreenSize from '../useScreenSize';
import TopItems from './TopItems';
import 'photoswipe/dist/photoswipe.css'
import Cookies from 'universal-cookie';
import './Home.css';

const VirtaulHome = () => {
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
    
    // window.querySelector
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
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
    // const scroll = percentScroll();

    // // To index in array
    // const index = Math.max(0, Math.floor(scroll * allMetaDataRef.current.length));
    // let currentDate = allMetaDataRef.current[index].dateTaken;
    // currentDate = currentDate.split('T').shift();
    // setmetaCurrentDate(currentDate);
    // setmetaCurrentYear(currentDate.split('-')[0]);
    // setmetaCurrentMonth(currentDate.split('-')[1]);


    if (allMetaDataRef.current.length === 0) {
      return;
    }

    // Get scroll percent of page
    const percentScroll = scrollPercent();
    // Convert to index in array
    const index = Math.max(0, Math.floor(percentScroll * allMetaDataRef.current.length));
    // Get dateTaken of index image
    let currentDate = allMetaDataRef.current[allMetaDataRef.current][index].dateTaken;
    console.log(percentScroll + " -> " + index + " -> " + currentDate);
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);


  };

  const scrollPercent = () => {
    var body = document.body, html = document.documentElement;
    var height = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);
    return window.scrollY / height;
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

  const Row = ({ index, style }) => {
    // const isEvenRow = index % 2 === 0;
    // const backgroundColor = isEvenRow ? '#F9A03F' : '#FDDB3A';
    // const textColor = isEvenRow ? '#FFFFFF' : '#4A4A4A';
    const rowStyle = {
      ...style,
      // backgroundColor,
      // color: textColor,
      
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 16px',
    };
    // return (
    //   <div style={rowStyle}>
    //     <p>{metaData[index].guid}</p>
    //     <p>{metaData[index].name}</p>
    //     <p>{metaData[index].sizeKb}</p>
    //   </div>
    // );

    let allImgColumnIndex = [0,1,2,3,4,5,6];
    return (
      <div style={rowStyle}>
        {/* {console.log(currentMetaDataRef.current)}
          {currentMetaDataRef.current[index] && 
            currentMetaDataRef.current[index].map((m, index) => {
            return(
              <Item
                style={{...style}}
                id={m.guid}
                original={"photos/" + m.guid}
                thumbnail={"photos/" + m.guid + "/thumb"}
                width={m.width}
                height={m.height}
                caption={
                  m.dateTaken + " - " + 
                  m.name + " - " + 
                  m.width + "x" + m.height + " - " + 
                  m.sizeKb + "kB"}
                  >
                  {({ ref, open }) => (
                    <img ref={ref} onClick={open} src={"photos/" + m.guid + "/thumb"} alt={m.dateTaken}/>
                    )}
                </Item>
              )
            })
          } */}

          {allImgColumnIndex.map((i) => {
            return(
              i < columns && index*columns + i < allMetaData.length &&
              <img 
                key={index*columns+i} 
                id={index*columns+i} 
                src={"photos/" + allMetaData[index*columns+i].guid + "/thumb"} 
                alt="alt" 
                style={{ maxWidth: (90.0 / columns)+'%'}}
              />
            )
          })}

          {/* {index*columns < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns].guid + "/thumb"} alt="alt"/>
          }
          {index*columns + 1 < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns+1].guid + "/thumb"} alt="alt" style={{ maxWidth: (90.0 / columns)+'%'}}/>
          }
          {index*columns + 2 < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns+2].guid + "/thumb"} alt="alt" style={{ maxWidth: (90.0 / columns)+'%'}}/>
          }
          { columns >= 5 && index*columns + 3 < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns+3].guid + "/thumb"} alt="alt" style={{ maxWidth: (90.0 / columns)+'%'}}/>
          }
          { columns >= 5 && index*columns + 4 < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns+4].guid + "/thumb"} alt="alt" style={{ maxWidth: (90.0 / columns)+'%'}}/>
          }
          { columns === 7 && index*columns + 5 < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns+5].guid + "/thumb"} alt="alt" style={{ maxWidth: (90.0 / columns)+'%'}}/>
          }
          { columns === 7 && index*columns + 6 < allMetaData.length &&
            <img src={"photos/" + allMetaData[index*columns+6].guid + "/thumb"} alt="alt" style={{ maxWidth: (90.0 / columns)+'%'}}/>
          } */}

      </div>
    )
  };

  const getItemSize = index => {
    return 220;
    const defaultValue = 200;
    const totalWidth = window.screen.width;
    // console.log('totalWidth: ' + totalWidth);
    if (!totalWidth) {
      // console.log('!totalWidth');
      return defaultValue;
    }
    const imgWidth = totalWidth / columns; //16px padding
    if (!imgWidth) {
      // console.log('!imgWidth');
      return defaultValue;
    }
    const imgHeight = imgWidth * 1.5; // Maximum 3:2 aspect ratio
    if (!imgHeight) {
      // console.log('!imgHeight');
      return defaultValue;
    }

    // console.log('imgHeight: ' + imgHeight);

    return imgHeight;
  };

  const galleryOptions = {
    zoom: false,
    bgOpacity: 0.2,
  };

  return (
    <div style={{ height: '95vh'}}>
      <h2 className="text-rounded-corners" style={{position: 'fixed', top:'55px', marginLeft: "10px", zIndex: '1'}}>
        {months[+metaCurrentMonth - 1]} {metaCurrentYear} 
      </h2>
      <TopItems 
        toggleColumns={toggleColumns} 
        sortByDate={sortByDate} 
        filterByDates={filterByDates} 
        noPhotos={allMetaData.length} 
        startDate={metaCurrentDate}
        />

        {/* <div id="gallery"> */}

          <Gallery withCaption id="my-gallery" options={galleryOptions}>
            <AutoSizer id="gallery">
              {({ height, width }) => (
                <VariableSizeList 
                // height={height} 
                height={height} 
                width={width} 
                itemSize={getItemSize} 
                itemCount={groupByN(columns, allMetaData).length}
                >
                  {Row}
                </VariableSizeList>
              )}
            </AutoSizer>

          {/* {groupByN(columns, allMetaData).map((group, index) => (
            <div key={index} className="row align-items-center g-1 mb-1">
            {group.map(currentMetaData =>
              <div className="col" style={{display: 'flex', justifyContent:'center'}}key={currentMetaData.guid}>
              <Item
              id={currentMetaData.guid}
              original={"photos/" + currentMetaData.guid}
              thumbnail={"photos/" + currentMetaData.guid + "/thumb"}
              width={currentMetaData.width}
              height={currentMetaData.height}
              caption={
                currentMetaData.dateTaken + " - " + 
                currentMetaData.name + " - " + 
                currentMetaData.width + "x" + currentMetaData.height + " - " + 
                currentMetaData.sizeKb + "kB"}
                >
                {({ ref, open }) => (
                  <img ref={ref} onClick={open} src={"photos/" + currentMetaData.guid + "/thumb"} alt={currentMetaData.dateTaken}/>
                  )}
                  </Item>
                  </div>
                  )}
                  </div>
                ))} */}

          </Gallery>
    </div>
  );
};

export default VirtaulHome;