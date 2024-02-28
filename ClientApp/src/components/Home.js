import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery'
import TopItems from './TopItems';
import 'photoswipe/dist/photoswipe.css'
import Cookies from 'universal-cookie';
import './Home.css';

const Home = () => {
  // The 'useState' hook (function) returns a getter (variable) & setter (function) for your state value
  // and takes the initial/default value for it/to set it to, e.g.
  const [ columns, setColumns ] = useState(5);
  const [ pages, setPages ] = useState([]);
  const [ pageIndex, setPageIndex ] = useState(0);
  const [ metaData, setMetaData ] = useState([]);
  const [ sortOrder, setSortOrder ] = useState(true);
  const [ metaCurrentDate, setmetaCurrentDate ] = useState('0');
  const [ metaCurrentYear, setmetaCurrentYear ] = useState('0');
  const [ metaCurrentMonth, setmetaCurrentMonth ] = useState('0');
  
  const cookies = new Cookies();
  const pagesRef = useRef(pages);
  const pageIndexRef = useRef(pageIndex);
  const itemsPerPage = 10500;
  const months = [ "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December" ];

  // Empty dependency array -> Only run on component mount
  useEffect(() => { 
    populateData();

    const cookieColumns = cookies.get('columns');
    if (cookieColumns) {
      setColumns(cookieColumns);
    }

    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    pageIndexRef.current = pageIndex;
    handleScroll();
  }, [pageIndex]);

  const handleScroll = () => {
    if (pagesRef.current.length === 0) {
      return;
    }
    // Get scroll percent of page
    const percentScroll = scrollPercent();
    // Convert to index in array
    const index = Math.max(0, Math.floor(percentScroll * pagesRef.current[pageIndexRef.current].length));
    // Get dateTaken of index image
    let currentDate = pagesRef.current[pageIndexRef.current][index].dateTaken;
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

    setPages(groupByN(itemsPerPage, metaData));
    setMetaData(metaData);
  };

  const toggleColumns = () => {
    const columnsNew = 
    columns === 3? 5 : 
      (columns === 5? 7 : 3);
    setColumns(columnsNew);
    cookies.set('columns', columnsNew, { path: '/' });
  };
  
  const sortByDate = () => {
    let sortedMetaData = [...metaData].sort((a, b) => {
      if (sortOrder) {
        return a.dateTaken > b.dateTaken
      } else {
        return a.dateTaken < b.dateTaken
      }
    });
    setPages(groupByN(itemsPerPage, metaData));
    setMetaData(sortedMetaData);
    setSortOrder(!sortOrder);
  };

  const nextPage = () => {
    if (pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1);
    }
  }

  const prevPage = () => {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    }
  }

  // TODO: fix
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
    /*
    const index = 0;
    let currentDate = metaDataRef.current[index].dateTaken;
    currentDate = currentDate.split('T').shift();
    setmetaCurrentDate(currentDate);
    setmetaCurrentYear(currentDate.split('-')[0]);
    setmetaCurrentMonth(currentDate.split('-')[1]);
    */
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
          nextPage={nextPage} 
          prevPage={prevPage} 
          noPhotos={pages.length > 0 && pages[0].length} 
          startDate={metaCurrentDate}
          />
        <div>
          <Gallery withCaption id="my-gallery">
          { pages.length > 0 &&
          groupByN(columns, pages[pageIndex]).map((group, index) => (
            <div key={index} className="row align-items-center g-1 mb-1">
              {group.map(m =>
                <div className="col" style={{display: 'flex', justifyContent:'center'}}key={m.guid}>
                  <Item
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