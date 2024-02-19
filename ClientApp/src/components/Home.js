import React, { Component } from 'react';

export class Home extends Component {
  static displayName = Home.name;

  constructor(props) {
    super(props);
    this.state = { images: [], metaData: [], showImageName: false, loading: true };
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
    // .then((result) => {
    //   localImages.sort((a, b) => a.metaData.guid < b.metaData.guid);
    //   this.setState({ images: localImages, loading: false})
    // });

    console.log("images.length: " + localImages.length);
  }

  toggleImageName = () => {
    this.setState({ showImageName: !this.state.showImageName });
  }

  static renderImages(images) {
    return (
      <div className="container">
        {this.groupByN(6, images).map(group => (
          <div className="row align-items-center g-2 mb-2">
            {group.map(image =>
              <div className="col-2">
                <img src={URL.createObjectURL(image.image)} alt="Img" width="100%" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  render() {
    let contents = this.state.loading
      ? <p><em>Loading...</em></p>
      : Home.renderImages(this.state.images);

    return (
      <div>
        {contents}
      </div>
    );
  }  
}
