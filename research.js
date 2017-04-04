var express = require('express');

var arc = {};
arc.log = function (s) { console.log('arc: ' + s); };

var shell = require('shelljs');
var bodyParser = require('body-parser');
var geo = require('./geo-viewport');
var fs = require('fs-extra'),
    request = require('request');

var app = express();

var Datastore = require('nedb')
  , db = new Datastore({ filename: 'path/to/datafile', autoload: true });

// parse application/x-www-form-urlencoded

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

filename_to_coords = function(filename) {
  var parts = filename.split('/');
  var lastSegment = parts.pop() || parts.pop();
  var underscore = lastSegment.split('_')
  var zoom_ext = underscore.pop().split('.')
  var zoom = zoom_ext[0]
  var lat_long = underscore.pop().split('-')

  var b = geo.bounds(lat_long, zoom, [1200, 1200]);

  conv_lat_long = []
  for (var ll in b) {
    conv_lat_long.push(parseFloat(b[ll]))
  }
  conv_lat_long.push(parseInt(zoom))
  return (conv_lat_long)
}

coordinates_to_innerbbox = function(coords) {
  return [coords[0][0][0], coords[0][0][1], coords[0][2][0], coords[0][2][1]]
}

innerbbox_to_coordinates = function(innerbbox) {
  var coords = [[innerbbox[0], innerbbox[1]],[innerbbox[0], innerbbox[3]],[innerbbox[2], innerbbox[3]],[innerbbox[2], innerbbox[1]],[innerbbox[0], innerbbox[1]]]
  return [coords]
}
app.use(express.static('Research'));
app.listen(4185, function () {
  console.log('ARCANE app listening on port 4185!');

  predictOnModel("bahrain")
  // for (job of ['20161220-162010-c9e0','20170307-194541-1b1f','20170307-043801-ae19']) {
  //  convertFromSummaryToGeoJSON(job);
  // }
  // convertFromSummaryToGeoJSON()
  // convertFalsePositivesToAnnotations([6,7,8,9,10,12,13,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,39,40,42,43,44,46])
  // convertFalsePositivesToAnnotations([7,8,9,10,11,13,14,16,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,48,49,51,52,53,54])
  // convertFalsePositivesToAnnotations([20,21,22,23,24,50,51,54,81,138,139,140,141,144,176,177,178,179,180,187,195,199,200,201,202,203,204,205,207,210,213,214])
});


function split_title(title) {
  var splits = title.split('_')
  var job = splits.pop()
  return [splits.join('_'), job]
}

function count(destinationFolder) {

  return shell.exec("cd "+destinationFolder+" || exit; ls  | wc -l", { silent:false }).stdout;
}

function predictOnModel(title){
  console.log("count of the things in " + title)
  file_count = count("/media/dev/Maxtor/linux/spots1/Research/SearchAreas/"+title+"_shards/" +title + "_lists/");
  shell.rm("nohup.out")
  output = shell.exec("Research/SearchAreas/predict_demo.sh > nohup.out", {silent: false}).stdout
  var str;
  var new_str;

  function check_nohup() {

    var new_str = shell.exec('wc -l nohup.out').stdout;
    console.log("new_str" + new_str)
    if (new_str != str) {
      setTimeout(check_nohup, 10000);
    } else {
      console.log("done")
    }

    str = new_str
  }

  check_nohup()



}

function convertFalsePositivesToAnnotations(title, positives, negatives) {

  console.log("convertFalsePositivesToAnnotations was called.")
  console.log("positives:", positives)
  console.log("negatives:", negatives)
  var size = [1200, 1200]
  var split = split_title(title)
  if (split.length < 2) {
    arc.log("title error")
    return
  }
  var job = split[1]
  var searchArea = split[0]
  var base_summary_path = '/media/dev/Maxtor/linux/spots1/Research/SearchAreas/' + searchArea + '_shards/' + job + '/'
  var summary_path = base_summary_path + 'predict_' + searchArea + '_summary.json'
  var pred_summary = JSON.parse(fs.readFileSync(summary_path, 'utf8'));
  var geojsonfile = fs.readFileSync('/media/dev/Maxtor/linux/spots1/Research/SearchAreas/' + title + '.geojson', 'utf-8');
  var geojson = JSON.parse(geojsonfile)
  var neg_coords = []
  var pos_coords = []
  var base_dataset = '/media/dev/Maxtor/linux/spots1/Research/SearchAreas/Datasets/'
  // Get the negative coords we want to put as hard negs and good positives
  for (var feature_i in geojson["features"]) {
    var feature = geojson["features"][feature_i]
    var coords = feature["geometry"]["coordinates"]
    var innerbbox = coordinates_to_innerbbox(coords)
    if (feature_i in negatives) {
      console.log("feature_i", feature_i)
      neg_coords.push(innerbbox);
    }
    if ( feature_i in positives) {
      pos_coords.push(innerbbox);
    }
  }

  var coords_to_filename = {}
  var tile_coords = []
  // creating the useful inverse index
  for (var key in pred_summary) {
    coords = filename_to_coords(key)
    tile_coords.push(coords)
    coords_to_filename[coords] = key;
  }
  img_dir = base_dataset + title + '/images/'
  anno_dir = base_dataset + title + '/annotations/'
  mkdir(base_dataset + title)
  mkdir(img_dir)
  mkdir(anno_dir)
  for (pos_coord of pos_coords) {
    var intersectTiles = batch_intersects(pos_coord, tile_coords);
    if (intersectTiles != []) {
      for (intersectTile of intersectTiles){
        var filename = coords_to_filename[intersectTile]
        var leafname = filename.split('\\').pop().split('/').pop().split('.jpg').shift();
        fs.copySync(filename, img_dir  + leafname + '.jpg')
        console.log("fs.copySync", leafname)
        var pixelcoords = calculateBboxLocation(intersectTile, pos_coord, size)
        var line = "Airplane " + "0 " + "0 " + "0 " + pixelcoords.join(" ") + " 0 0 0 0 0 0 0 0\n"
        console.log(line)
        var anno_path = anno_dir + leafname + '.txt'
        console.log
        write_append(anno_path, line, null)
      }
    } else {
      console.log("found no intersecting tile for " + pos_coord)
    }
  }


  var neg_tile_coords = []

  for (neg_coord of neg_coords) {
    var intersectTiles = batch_intersects(neg_coord, tile_coords);
    if (intersectTiles != []) {
      neg_tile_coords.concat(intersectTile)
    } else {
      console.log("found no intersecting tile for " + neg_coord)

    }
  }

  var neg_tile_filenames = []

  for (neg_tile_coord of neg_tile_coords) {
    neg_tile_filenames.push(coords_to_filename[neg_tile_coord])
  }
  console.log("neg_tile_filenames")
  console.log(neg_tile_filenames)

  for (neg_tile_filename of neg_tile_filenames) {
    var leafname = neg_tile_filename.split('\\').pop().split('/').pop().split('.jpg').shift();
    console.log(leafname)
    fs.copySync(neg_tile_filename, img_dir  + leafname + '.jpg')
    fs.writeFileSync(anno_dir + leafname + '.txt', "", 'utf-8');
  }

  console.log("convertFalsePositivesToAnnotations finished writing new dataset to " +  base_dataset + title)

  stats = {}
  stats["title"] = title
  stats["positives"] = positives
  stats["negatives"] = negatives
  fs.writeFileSync(base_summary_path + "/pos_neg.json", JSON.stringify(stats), 'utf-8')
}

function write_append(path, data, err) {
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, data, 'utf-8');
  } else {
    fs.writeFileSync(path, data, {'flag':'a'});
  }

}

function mkdir(img_dir) {
  if (!fs.existsSync(img_dir)){
      fs.mkdirSync(img_dir);
  }
}
function batch_intersects(r1, list_r2) {
  list_intersects = []
  for (r2 of list_r2) {
    if (intersects(r1,r2)) {
      list_intersects.push(r2);
    }
  }

  return list_intersects;
}

function intersects(r1, r2) {
    return !( r2[0] > r1[2]
           || r2[2] < r1[0]
           || r2[1] > r1[3]
           || r2[3] < r1[1]
           );
}

function convertFromSummaryToGeoJSONWithTitle(geojson) {
  var vars = split_title(geojson)
  return convertFromSummaryToGeoJSON(vars[0], vars[1])

}

function convertFromSummaryToGeoJSON(searchArea, job) {
  geojson = '/media/dev/Maxtor/linux/spots1/Research/SearchAreas/' + searchArea+ '_' + job + '.geojson'
  if (fs.existsSync(geojson)){
		return true
	}
  geoboxes = []
  // var searchArea = 'slovenia_177sqkm'
  var pred_summary = JSON.parse(fs.readFileSync('Research/SearchAreas/'+searchArea+'_shards/' + job + '/predict_'+searchArea + '_summary.json','utf8'));
  //var pred_summary = JSON.parse(fs.readFileSync('/media/dev/Maxtor/linux/spots1/Research/SearchAreas/predict_bahrain_summary_neg_2.json', 'utf8'));
  var template = JSON.parse(fs.readFileSync('/media/dev/Maxtor/linux/spots1/Research/SearchAreas/geojson_template.json', 'utf8'));
  var feature_temp = template["features"][0]
  delete feature_temp["geometry"]["coordinates"]
  var dictBbox = {}
  template["features"] = []
  for (var key in pred_summary) {
    coords = filename_to_coords(key)
    for (var i of pred_summary[key]) {
      innerbbox = calculateBboxLocationReverse(coords.slice(0,4), i.slice(0,4), [1200,1200]);
      // this_temp =(JSON.parse(JSON.stringify(feature_temp)))
      // this_temp["geometry"]["coordinates"] = innerbbox_to_coordinates(innerbbox)
      // //console.log(this_temp);
      // //console.log("this temp")
      // template["features"].push(this_temp)

      key = round(innerbbox[0],2)
      if (key in dictBbox) {
        dictBbox[key].push(innerbbox)

      } else {
        dictBbox[key] = [innerbbox]
      }

      geoboxes.push(innerbbox)
    }


  }

  for (var index in dictBbox) {
    var arr = dictBbox[index];
    arr = mergeBoundingBoxes(arr)
    for (obj of arr) {
      this_temp =(JSON.parse(JSON.stringify(feature_temp)))
      this_temp["geometry"]["coordinates"] = innerbbox_to_coordinates(obj)
      //console.log(this_temp);
      console.log("writing feature...")
      template["features"].push(this_temp)
    }
  }

  // console.log(dictBbox)
  //console.log(JSON.stringify(template, null, 2));
  fs.writeFileSync(geojson, JSON.stringify(template, null, 2) , 'utf-8');
  return true
}

function round(value, decimals) {
  return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

function mergeBoundingBoxes(array) {
  var newArr = [];
  var combinedlist = {};
  for (i in array) {
    if (i in combinedlist) {
      continue;
    }
    var combined = array[i]
    for (j = i; j < array.length; j++ ) {
      obj = array[j]
      var intersectionP = intersectionPercentage(obj, combined)
      if (intersects(obj,combined)) {
        if (intersectionP < 0.9995) {
          //console.log(intersectionP)
        } else {
          combinedlist[j] = true
          combined = merge(obj, combined)
        }
      }
    }
    newArr.push(combined);
  }
  return newArr;
}

function intersects(r1, r2) {
    return !( r2[0] > r1[2]
           || r2[2] < r1[0]
           || r2[1] > r1[3]
           || r2[3] < r1[1]
           );
}

function intersectionPercentage(boxA, boxB) {
  if (intersects(boxA,boxB)) {
    xA = Math.max(boxA[0], boxB[0])
    yA = Math.max(boxA[1], boxB[1])
    xB = Math.min(boxA[2], boxB[2])
    yB = Math.min(boxA[3], boxB[3])

    //# compute the area of intersection rectangle
    interArea = (xB - xA + 1) * (yB - yA + 1)

    //# compute the area of both the prediction and ground-truth
    //# rectangles
    boxAArea = (boxA[2] - boxA[0] + 1) * (boxA[3] - boxA[1] + 1)
    boxBArea = (boxB[2] - boxB[0] + 1) * (boxB[3] - boxB[1] + 1)

    //# compute the intersection over union by taking the intersection
    //# area and dividing it by the sum of prediction + ground-truth
    //# areas - the interesection area
    iou = interArea / (1.0*(boxAArea + boxBArea - interArea))
    return iou
  }
  return null
}

function merge(r1, r2) {
   return [ Math.min(r1[0], r2[0]),
            Math.min(r1[1], r2[1]),
            Math.max(r1[2], r2[2]),
            Math.max(r1[3], r2[3])
          ]
}

// app.get('/', function (req, res) {
//   res.send('Hello Sudev!');
// });
app.post('/validation', function (req, res) {
  var title = req.body["title"];
  var correct = req.body["correct"];
  var incorrect = req.body["incorrect"];
  arc.log("validation called.")
  convertFalsePositivesToAnnotations(title, correct, incorrect)
  res.send(req.body.content);
})

app.post('/validation', function (req, res) {
  var title = req.body["title"];
  var correct = req.body["correct"];
  var incorrect = req.body["incorrect"];
  arc.log("validation called.")
  convertFalsePositivesToAnnotations(title, correct, incorrect)
  res.send(req.body.content);
})

app.post('/generateGeoJSON', function (req, res) {
  var title = req.body["title"];

  arc.log("generateGeoJSON called.")
  done = convertFromSummaryToGeoJSONWithTitle(title);
  if (done) {
    res.send(req.body.content);
  }

})

app.post('/resultSearchArea', function (req, res) {
  arc.log("resultSearchArea");
  arc.log(req.body["title"]);

})

app.post('/createSearchArea', function (req, res) {
  arc.log("createSearchArea");
  arc.log(req.body["title"]);
  var title = req.body["title"];
  if (JSON.stringify(req.body["geojson"]["features"]) == '[]') {
    res.sendStatus(0);
    return;
  }
  var stringifygeo = JSON.stringify(req.body["geojson"], null, 2);
  fs.writeFile("Research/SearchAreas/" + title + '.geojson', stringifygeo, "utf8", function(err) {
      if(err) {
          return console.log(err);
      }

      console.log("The " + title + " was saved!");
      res.send(req.body.content);
      for (i of req.body["geojson"]["features"]){
        if ("bbox" in i) {

          arc.log("Downloading bounding box...");
          var bbox = i["bbox"];
          var polygon;
          if ("geometry" in i && "coordinates" in i["geometry"]) {

            polygon = i["geometry"]["coordinates"][0];
            arc.log("THERE IS POLYGON");
          }
          arc.downloadSearchArea(title, bbox, polygon);
        }

      }

      //res.sendStatus(1);
  });
})

var mkdirSync = function (path) {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }
}

arc.downloadSearchArea = function(title, bbox, polygon) {
  var dir = "Research/SearchAreas/" + title;
  mkdirSync(dir);
  lat = bbox[0];
  lon = bbox[1];
  latH = bbox[2];
  lonH = bbox[3];
  var size = [1200, 1200]
  var i = 0;
  var c = 0.0015
  for (var la = +lat; la+c <= latH; la += c) {
    for (var lo = +lon; lo+c <= lonH; lo += c) {
      targetbbox = [la,lo,la+c,lo+c]
      var vp = geo.viewport(targetbbox, size);
      outerbbox = geo.bounds(vp.center, vp.zoom, size);
      if (polygon.length > 4 && !inside(vp.center, polygon)) {
        arc.log("we not inside polygon")
        continue
      }
      // la = outerbbox[2];
      // lo = outerbbox[3];
      i++;
      console.log("image",i," :",la,lo,la+0.0015,lo+0.0015);
      var link = 'https://api.mapbox.com/v4/digitalglobe.nal0g75k/' +
          vp.center.join(',') + ',' +
          vp.zoom + '/' +
          size.join('x') + '.jpg' +
          '?access_token=' + accessToken;
      if (vp.zoom != null) {
        var filename = vp.center.join('-') + "_" + vp.zoom;
        //sleepFor(100);
        download(link, filename + '.jpg', dir);
        //sleepFor(100);
      }





    }
  }
  downloadFlush(function(){
    arc.log('Done downloading');
  })

}

app.post('/geojson', function (req, res) {
	arc.log("GEOJSON");
	//var content = req.body.content;
	var features = req.body["geojson"]["features"];
  if (JSON.stringify(features) == '[]') {
    res.sendStatus(0);
    return;
  }
	arc.log('body: ' + JSON.stringify(features));
	var bbox = [];
	for (object of features) {
		//console.log("Bbox is " + object["bbox"]);
		bbox.push(object["bbox"]);
	}

	urlsFromBboxes(bbox);
	res.send(req.body.content);
  //add auth token check
  //var customer_id = req.body.customer_id;
  // Check if customer has any pending reservations
  // If they do, refund escrow and cancel the reservation before deletion
  // Else delete the customer and all associated payment methods
  // spots.gateway.customer.delete(customer_id, function (err) {
  //   if (err) {
  //     spots.log("Failed to delete customer " + customer_id + " with error "+ err);
  //     res.status(499).send(JSON.stringify(err));
  //   }
  //   else {
  //     res.status(200).send("Payment methods deleted successfully.");
  //   }
  // });
});


var accessToken = 'pk.eyJ1IjoiZGlnaXRhbGdsb2JlIiwiYSI6ImNpeWczNGdoOTAyZHIzMnM1dTBncGMzM3oifQ.8Ss2VnUMVu7pFUuAhsDYZw'//'pk.eyJ1IjoiZGlnaXRhbGdsb2JlIiwiYSI6ImNpcjh0MjVrZjAwemFnM25rNWp5cHlocHYifQ.RTz2o1KzN126EG4AIg-9BA';


var splitbboxes = function (bboxes) {
	var boxlist = {};
	boxlist[bboxes[0]] = [bboxes[0]]
	for (bbox of bboxes) {
		added = false;
		for (var defbbox in boxlist) {
			//console.log(defbbox.split(','))
			//console.log(Number(bbox[0]))
			if (Math.abs(+defbbox.split(',')[0] - +bbox[0]) < 2 && Math.abs(+defbbox.split(',')[1] - +bbox[1]) < 2) {
				//console.log(boxlist[defbbox])
				boxlist[defbbox].push(bbox)
				added = true;
				//console.log("got added")
				break;
			}
		}
		if (!added) {
			boxlist[bbox] = [bbox]
			//console.log("new cluster")
		}
	}

	//console.log("THIS IS IT", boxlist);
	console.log("This is the number of clusters", Object.keys(boxlist).length)
	return boxlist
}



var urlsFromBboxes = function (bboxes) {
	var size = [300, 300];
	var urls = [];
	var i = 0;


	clustered_bboxes = splitbboxes(bboxes);


	for (clusterbboxeskey in clustered_bboxes) {
		minla = 200.0;
		minlo = 200.0;
		maxla = -200.0;
		maxlo = -200.0;
		clusterbboxes = clustered_bboxes[clusterbboxeskey];
		for (bbox of clusterbboxes) {
			minla = Math.min(bbox[0],minla)
			minlo = Math.min(bbox[1],minlo)
			maxla = Math.max(bbox[2],maxla)
			maxlo = Math.max(bbox[3],maxlo)



		}
		var i = 0
		var size = [1200, 1200];
		var total = 0;
		for (var la = +minla; la+0.0015 <= maxla; la += 0.0015) {
			for (var lo = +minlo; lo+0.0015 <= maxlo; lo += 0.0015) {
				targetbbox = [la,lo,la+0.0015,lo+0.0015]
				var vp = geo.viewport(targetbbox, size);
				outerbbox = geo.bounds(vp.center, vp.zoom, size)
				console.log("outer",outerbbox)
				innerbboxes = []
				innerbboxesLoc = []
				for (bbox of clusterbboxes) {
					if (isInside(outerbbox, bbox)) {
						innerbboxes.push(bbox);
						total++;
						var loc = calculateBboxLocation(outerbbox, bbox, size);
						innerbboxesLoc.push(loc);
					}

				}
				if (innerbboxes.length > 0) {
					i++;
					console.log("image",i," :",la,lo,la+0.0015,lo+0.0015);
					console.log("number of bboxes ", innerbboxes.length);
					var link = 'https://api.mapbox.com/v4/digitalglobe.nal0g75k/' +
					    vp.center.join(',') + ',' +
					    vp.zoom + '/' +
					    size.join('x') + '.jpg' +
					    '?access_token=' + accessToken;
					if (vp.zoom != null) {
						var filename = vp.center.join('-') + "_" + vp.zoom;

						download(link, filename + '.jpg', "images");

						var classValues = Array(innerbboxesLoc.length).fill("1");
						saveAnnotation(filename, classValues, innerbboxesLoc);
					}



				}

			}
		}
		console.log("Cluster ", minla,minlo,maxla,maxlo)
		console.log("Inside: ", total, "Total: ", bboxes.length)
	}
  downloadFlush(function () {
    arc.log("Done downloading for training")
  })


}




var saveAnnotation = function(filename, classValues, pixelbboxes) {
	var dir = "./annotations/"
	if (!fs.existsSync(dir)){
		fs.mkdirSync(dir);
	}
	var stream = fs.createWriteStream(dir + filename + ".txt");
	stream.once('open', function(fd) {
		for (i in Array.from(new Set(pixelbboxes))) {
			//stream.write(classValues[i] + ' ' + pixelbboxes[i].join(" ") + "\n");
			stream.write("Airplane " + "0 " + "0 " + "0 " + pixelbboxes[i].join(" ") + " 0 0 0 0 0 0 0 0\n" )
		}
	  	stream.end();
	  	console.log("Annotation saved for ", filename);
	});
}


var calculateBboxLocationReverse = function(latlongbox, pixelbbox, size) {
  xdeg = latlongbox[2] - latlongbox[0];
	ydeg = latlongbox[3] - latlongbox[1];
	xrat = size[0]/xdeg;
	yrat = size[1]/ydeg;
  xdela = pixelbbox[0]/xrat;
  ydela = (size[1] - pixelbbox[1])/(1.0*yrat);

  xdelb = pixelbbox[2]/xrat;
  ydelb = (size[1] -pixelbbox[3])/(1.0*yrat);

  innerbbox = [0.0,0.0,0.0,0.0];
  innerbbox[0] = xdela + latlongbox[0]
  innerbbox[1] = ydelb + latlongbox[1]
  innerbbox[2] = xdelb + latlongbox[0]
  innerbbox[3] = ydela + latlongbox[1]

  return innerbbox;

}

var calculateBboxLocation = function(outerbbox, innerbbox, size) {
	xdeg = outerbbox[2] - outerbbox[0];
	ydeg = outerbbox[3] - outerbbox[1];
	xrat = size[0]/(1.0*xdeg)
	yrat = size[1]/(1.0*ydeg)

	xdela = innerbbox[0] - outerbbox[0]
	ydela = innerbbox[1] - outerbbox[1]

	xdelb = innerbbox[2] - outerbbox[0]
	ydelb = innerbbox[3] - outerbbox[1]

	pixelbbox = [Math.round(xdela*xrat), Math.round(size[1]-ydelb*yrat),
					Math.round(xdelb*xrat), Math.round(size[1]-ydela*yrat)]
	console.log("New bbox location " , pixelbbox)

	return pixelbbox
}

var isInside = function(outerbbox, innerbbox) {
	if (outerbbox[0] < innerbbox[0] && outerbbox[1] < innerbbox[1]
		&& outerbbox[2] > innerbbox[2] && outerbbox[3] > innerbbox[3]) {
		return true
	}

	return false
}

// Download Queue

var downloadQueue = [];
var downloadFlushQueueLength = 0;
var downloadFlush = function(callback, notFirst) {
  if (notFirst === undefined) {
      downloadFlushQueueLength = downloadQueue.length;
  }
  if (downloadQueue.length > 0) {
    var down = downloadQueue.shift();
    if (down.length == 2) {
      var uri = down[1];
      request.head(uri, function(err, res, body){
        //console.log('content-type:', res.headers['content-type']);
        //console.log('content-length:', res.headers['content-length']);

        request(uri).pipe(fs.createWriteStream(down[0])).on('close', function(err) {
         if (err != null) {
           arc.log("Error downloading " + uri);
         }
         arc.log("downloaded " + (100-(downloadQueue.length*100/downloadFlushQueueLength)))
         downloadFlush(callback, true);
        });
      });
    }
  } else {
    callback();
  }
}

var download = function(uri, filename, folder){
  var file = "./"+folder+"/" +filename;
  downloadQueue.push([file, uri])
  arc.log("Download queue length " + downloadQueue.length);
  // request.head(uri, function(err, res, body){
  //   //console.log('content-type:', res.headers['content-type']);
  //   //console.log('content-length:', res.headers['content-length']);
  //
  //   request(uri).pipe(fs.createWriteStream("./"+folder+"/" +filename)).on('close', callback);
  // });
};

// Geometry functions

function inside(point, vs) {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
};
