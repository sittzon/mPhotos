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

  return (
      <div>
        <h2 className="text-rounded-corners" style={{position: 'fixed', top:'55px', marginLeft: "10px"}}>{metaCurrentDate}</h2>
        <TopItems toggleColumns={toggleColumns} sortByDate={sortByDate} noPhotos={metaData.length}/>
        <div>
          <Gallery withCaption id="my-gallery">
          {groupByN(columns, metaData).map((group, index) => (
            <div key={index} className="row align-items-center g-1 mb-1">
              {group.map(metaData =>
                <div className="col" key={metaData.guid}>
                  <Item
                    id={metaData.guid}
                    original={"photos/" + metaData.guid}
                    thumbnail={"photos/" + metaData.guid + "/thumb"}
                    width={metaData.width}
                    height={metaData.height}
                    caption={
                      metaData.dateTaken + " - " + 
                      metaData.name + " - " + 
                      metaData.width + "x" + metaData.height + " - " + 
                      metaData.sizeKb + "kB"}
                    >
                    {({ ref, open }) => (
                      <img ref={ref} onClick={open} src={"photos/" + metaData.guid + "/thumb"} alt={metaData.dateTaken}/>
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