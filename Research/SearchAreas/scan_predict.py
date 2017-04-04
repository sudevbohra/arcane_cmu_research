import json
import glob
import sys
searchAreaName = sys.argv[1]
# searchAreaName = "slovenia_177sqkm_shards/20161220-162010-c9e0/slovenia_177sqkm_predicted/predict_slovenia_177sqkm_shard"
print('./{0}_??.txt'.format(searchAreaName))
all_predicts = glob.glob('./{0}_??.txt'.format(searchAreaName))

def getBboxes(bboxes):
    return [bb for bb in bboxes if sum(bb) > 0.0]
print(all_predicts)
bboxes = {}
for f in all_predicts:
  with open(f) as json_data:
    data = json.load(json_data)

  outputs = data["outputs"]

  for key in outputs:

    val = outputs[key]["bbox-list"]
    if sum(val[0]) > 0.0:
       bboxes[key] = getBboxes(val)
       #print outputs

with open('{0}_summary.json'.format(searchAreaName), 'w') as fp:
    json.dump(bboxes, fp,  indent=2)
    print("wrote to {0}_summary.json".format(searchAreaName))
