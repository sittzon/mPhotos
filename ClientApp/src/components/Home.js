import React, { Component } from 'react';
import ModalImage from "react-modal-image";
// import { useHotkeys } from 'react-hotkeys-hook'
import './Home.css';

export class Home extends Component {
  static displayName = Home.name;

  constructor(props) {
    super(props);
    this.state = { images: [], metaData: [], showImageName: false, loading: true };
    this.toggleImageName = this.toggleImageName.bind(this);
  }

  componentDidMount() {
    this.populateData();
  }
  
  static groupByN = (n, arr) => {
    let result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
  };
  
  async populateData() {
    const response = await fetch('photo');
    const metaData = await response.json();
    this.setState({ metaData: metaData });
    
    let localImages = [];
    await Promise.all(metaData.map(async meta => {
      const response = await fetch('photo/' + meta.guid + '/thumb');
      const data = await response.blob();
      localImages.push({image: data, metaData: meta});
      this.setState({ images: localImages, loading: false})
    }))
    .then((result) => {
      localImages = localImages.sort((a, b) => a.metaData.guid < b.metaData.guid);
      this.setState({ images: localImages, loading: false})
    });

    console.log("images.length: " + localImages.length);
  }

  toggleImageName() {
    this.setState({ showImageName: !this.state.showImageName });
  }

  render() {
    let indexing = this.state.loading
      ? <p><em>Indexing...</em></p>
      : <p className="align-right">{this.state.images.length} photos</p>;

    return (
      <div>
        <button className="btn fixed btn-custom" onClick={this.toggleImageName}>Image name</button>
        { indexing }
        <div>
        {Home.groupByN(3, this.state.images).map(group => (
          <div className="row align-items-center g-1 mb-1">
            {group.map(image =>
              <div className="col-4" key={image.metaData.guid}>
                <ModalImage  key={image.metaData.guid}
                  small={URL.createObjectURL(image.image)}
                  medium={"photo/" + image.metaData.guid + "/medium"}
                  large={"photo/" + image.metaData.guid}
                  alt={image.metaData.name + " - " + image.metaData.sizekb + "kb"}
                  showRotate="true"
                />                
                <span>{this.state.showImageName && image.metaData.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    );
  }  
}
