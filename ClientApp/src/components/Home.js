import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery'
// import useScreenSize from '../useScreenSize';
import TopItems from './TopItems';
import 'photoswipe/dist/photoswipe.css'
import './Home.css';

const Home = () => {
  // The 'useState' hook (function) returns a getter (variable) & setter (function) for your state value
  // and takes the initial/default value for it/to set it to, e.g.
  const [ columns, setColumns ] = useState(5);
  const [ metaData, setMetaData ] = useState([]);
  const [ sortOrder, setSortOrder ] = useState(true);
  const [ metaCurrentDate, setmetaCurrentDate ] = useState('0');
  const [ metaCurrentYear, setmetaCurrentYear ] = useState('0');
  const [ metaCurrentMonth, setmetaCurrentMonth ] = useState('0');

  const months = [ "January", "February", "March", "April", "May", "June", 
           "July", "August", "September", "October", "November", "December" ];

  // Empty dependency array -> Only run on component mount
  useEffect(() => { 
    populateData();

    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    metaDataRef.current = metaData;
  }, [metaData]);

  const metaDataRef = useRef(metaData);

  const handleScroll = async (event) => {
    const scroll = percentScroll();

    // To index in array
    const index = Math.max(0, Math.floor(scroll * metaDataRef.current.length));
    let currentDate = metaDataRef.current[index].dateTaken;
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);
  };

  const percentScroll = () => {
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
    
    setMetaData(metaData);
  };

  const toggleColumns = () => {
    const columnsNew = 
    columns === 3? 5 : 
      (columns === 5? 7 : 3);
    setColumns(columnsNew);
  };
  
  const sortByDate = () => {
    let sortedMetaData = [...metaData].sort((a, b) => {
      if (sortOrder) {
        return a.dateTaken > b.dateTaken
      } else {
        return a.dateTaken < b.dateTaken
      }
    });
    setMetaData(sortedMetaData);
    setSortOrder(!sortOrder);
  };

  const filterByDates = () => {
    const filterStartDate = document.querySelector('#filterStartDate');
    const filterEndDate = document.querySelector('#filterEndDate');

    // Get metadata index of filterStartDate & filterEndDate
    const startIndex = metaData.findIndex((photo) => {
      return photo.dateTaken.split('T').shift() > filterStartDate.value;
    });
    const endIndex = metaData.findIndex((photo) => {
      return photo.dateTaken.split('T').shift() >= filterEndDate.value;
    });
    // console.log(filterStartDate.value);
    // console.log(filterEndDate.value);
    console.log(startIndex);
    console.log(endIndex);

    TopItems.startDate = filterStartDate.value;
    
    setMetaData(metaData.slice(startIndex, endIndex));
    // To index in array
    const index = 0;
    let currentDate = metaDataRef.current[index].dateTaken;
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);
  }

  return (
      <div>
        <h2 className="text-rounded-corners" style={{position: 'fixed', top:'55px', marginLeft: "10px"}}>
          {months[+metaCurrentMonth - 1]} {metaCurrentYear} 
        </h2>
        <TopItems 
          toggleColumns={toggleColumns} 
          sortByDate={sortByDate} 
          filterByDates={filterByDates} 
          noPhotos={metaData.length} 
          // startDate='2000-01-01'
          startDate={metaCurrentDate}
          // startDate={metaData[0].dateTaken.toString().split('T').shift()} 
          />
        <div>
          <Gallery withCaption id="my-gallery">
          {groupByN(columns, metaData).map((group, index) => (
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
          ))}
          </Gallery>
        </div>
      </div>
  );
};

export default Home;