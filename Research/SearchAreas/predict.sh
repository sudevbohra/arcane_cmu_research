ls -d "$PWD/$1"/* > $1.list
mkdir $1_shards
mkdir $1_shards/$1_lists/
split -l 100 $1.list $1_shards/$1_lists/$1_shard_
mkdir $1_shards/$2
for file in /media/dev/Maxtor/linux/spots1/Research/SearchAreas/$1_shards/$1_lists/$1_*
do
 # do something on $file
 name="${file##*/}"
 echo "curl localhost:4186/models/images/generic/infer_many.json -XPOST -F job_id=$2 -F image_list=@$file $3 > $1_shards/$2/predict_${name}.txt"

 curl localhost:4186/models/images/generic/infer_many.json -XPOST -F job_id=$2 -F image_list=@$file $3 > $1_shards/$2/predict_${name}.txt
done

python scan_predict.py "$1_shards/$2/predict_$1"
