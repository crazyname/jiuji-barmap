// 初始 31 家来自用户上传的旧地图，绝不把示意坐标当做地理坐标。
// status 是经营证据等级，不是此刻是否开门。
const initialBars = [
  {
    "id": 1,
    "name": "庙前冰室 Hope & Sesame",
    "searchKey": "庙前冰室",
    "station": "东山口",
    "exit": "F",
    "originalDistanceM": 400,
    "lines": [
      "1",
      "6"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": {
      "score": 4.5,
      "price": 141,
      "reviews": 15,
      "platform": "携程",
      "source": "https://gs.ctrip.com/html5/you/foods/fooddetail/120098/93757808.html"
    },
    "addressHint": "庙前西街58号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 2,
    "name": "庙前岽舍 DSK",
    "searchKey": "庙前岽舍",
    "station": "东山口",
    "exit": "F",
    "originalDistanceM": 400,
    "lines": [
      "1",
      "6"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "启明一马路1号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 3,
    "name": "庙前三西",
    "searchKey": "庙前三西",
    "station": "杨箕东",
    "exit": "B",
    "originalDistanceM": 190,
    "lines": [
      "10"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 4,
    "name": "樑 LIÁNG",
    "searchKey": "樑",
    "station": "石牌桥",
    "exit": "B",
    "originalDistanceM": 200,
    "lines": [
      "1",
      "3"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "天河路389号广州文华东方酒店",
    "location": null,
    "locationSource": null
  },
  {
    "id": 5,
    "name": "The Loft",
    "searchKey": "The Loft",
    "station": "石牌桥",
    "exit": "B",
    "originalDistanceM": 200,
    "lines": [
      "1",
      "3"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": {
      "score": 4.9,
      "price": null,
      "reviews": 64,
      "platform": "Tripadvisor",
      "source": "https://tapc.ctrip.com/Restaurant_Review-g298555-d8768754-Reviews-The_Loft-Guangzhou_Guangdong.html"
    },
    "addressHint": "天河路389号广州文华东方酒店",
    "location": null,
    "locationSource": null
  },
  {
    "id": 6,
    "name": "BARISING",
    "searchKey": "BARISING",
    "station": "东湖",
    "exit": "C",
    "originalDistanceM": 370,
    "lines": [
      "6",
      "10",
      "12"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 7,
    "name": "Four Box",
    "searchKey": "Four Box",
    "station": "公园前",
    "exit": "D",
    "originalDistanceM": 290,
    "lines": [
      "1",
      "2"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "教育路64号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 8,
    "name": "Gossip Neighbor",
    "searchKey": "Gossip Neighbor",
    "station": "杨箕东",
    "exit": "B",
    "originalDistanceM": 240,
    "lines": [
      "1",
      "10"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 9,
    "name": "Moonback",
    "searchKey": "Moonback",
    "station": "石牌桥",
    "exit": "A",
    "originalDistanceM": 300,
    "lines": [
      "1",
      "3"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 10,
    "name": "Shift Cocktail Bar",
    "searchKey": "Shift Cocktail Bar",
    "station": "五羊邨",
    "exit": "C",
    "originalDistanceM": 130,
    "lines": [
      "5",
      "10"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 11,
    "name": "莲城 Lotus Lounge",
    "searchKey": "Lotus Lounge",
    "station": "猎德",
    "exit": "D",
    "originalDistanceM": 370,
    "lines": [
      "5"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "兴盛路7号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 12,
    "name": "TIN & PONY",
    "searchKey": "TIN & PONY",
    "station": "五羊邨",
    "exit": "B",
    "originalDistanceM": 360,
    "lines": [
      "5",
      "10"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 13,
    "name": "NEXT 精酿",
    "searchKey": "NEXT 精酿",
    "station": "北京路",
    "exit": "B",
    "originalDistanceM": 320,
    "lines": [
      "6"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "文德路青云直街60号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 14,
    "name": "Beer Hardcore·花城总店",
    "searchKey": "Beer Hardcore",
    "station": "猎德",
    "exit": "D",
    "originalDistanceM": 300,
    "lines": [
      "5"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "花城大道嘉裕公馆",
    "location": null,
    "locationSource": null
  },
  {
    "id": 15,
    "name": "叙旧精酿",
    "searchKey": "叙旧精酿",
    "station": "冼村",
    "exit": "B",
    "originalDistanceM": 320,
    "lines": [
      "1",
      "18"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 16,
    "name": "Trio.A",
    "searchKey": "Trio.A",
    "station": "潭村",
    "exit": "C",
    "originalDistanceM": 190,
    "lines": [
      "5"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 17,
    "name": "酒窝 Petit Pot",
    "searchKey": "酒窝 Petit Pot",
    "station": "东湖",
    "exit": "A",
    "originalDistanceM": 100,
    "lines": [
      "6",
      "10",
      "12"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 18,
    "name": "江湖边·小生活",
    "searchKey": "江湖边 小生活",
    "station": "江南西",
    "exit": "A",
    "originalDistanceM": 360,
    "lines": [
      "2"
    ],
    "status": "closed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 19,
    "name": "猫员外·刺猬店",
    "searchKey": "猫员外 刺猬店",
    "station": "体育西路",
    "exit": "A",
    "originalDistanceM": 120,
    "lines": [
      "1",
      "3"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 20,
    "name": "天吧 Tian Bar",
    "searchKey": "天吧",
    "station": "大剧院",
    "exit": "A",
    "originalDistanceM": 180,
    "lines": [
      "APM",
      "3"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": {
      "score": 4.1,
      "price": 243,
      "reviews": 9,
      "platform": "携程",
      "source": "https://you.ctrip.com/food/guangzhou152/24987264.html"
    },
    "addressHint": "珠江西路5号广州四季酒店",
    "location": null,
    "locationSource": null
  },
  {
    "id": 21,
    "name": "悦吧 The Roof Bar",
    "searchKey": "悦吧",
    "station": "珠江新城",
    "exit": "C",
    "originalDistanceM": 30,
    "lines": [
      "3",
      "5"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": {
      "score": 4.7,
      "price": 236,
      "reviews": 13,
      "platform": "携程",
      "source": "https://gs.ctrip.com/html5/you/foods/fooddetail/2015069/25030471.html"
    },
    "addressHint": "华夏路16号广州柏悦酒店",
    "location": null,
    "locationSource": null
  },
  {
    "id": 22,
    "name": "高極 Too High",
    "searchKey": "Too High",
    "station": "花城大道",
    "exit": "B",
    "originalDistanceM": 190,
    "lines": [
      "APM",
      "3",
      "5"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": {
      "score": 4.4,
      "price": 290,
      "reviews": 7,
      "platform": "携程",
      "source": "https://gs.ctrip.com/html5/you/foods/fooddetail/152/79860612.html"
    },
    "addressHint": "珠江东路6号广州瑰丽酒店",
    "location": null,
    "locationSource": null
  },
  {
    "id": 23,
    "name": "Carpe Diem 精酿空间",
    "searchKey": "Carpe Diem 精酿空间",
    "station": "体育中心",
    "exit": "B",
    "originalDistanceM": 390,
    "lines": [
      "1"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 24,
    "name": "Rozz-Tox",
    "searchKey": "Rozz Tox",
    "station": "五羊邨",
    "exit": "A",
    "originalDistanceM": 720,
    "lines": [
      "5",
      "10"
    ],
    "status": "official",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "寺右二南街六巷19号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 25,
    "name": "The Strand Beer Cafe",
    "searchKey": "The Strand Beer Cafe",
    "station": "五羊邨",
    "exit": "A",
    "originalDistanceM": 290,
    "lines": [
      "5",
      "10"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "五羊新城春风路1号",
    "location": null,
    "locationSource": null
  },
  {
    "id": 26,
    "name": "Redline Speakeasy",
    "searchKey": "Redline Speakeasy",
    "station": "杨箕东",
    "exit": "B",
    "originalDistanceM": 120,
    "lines": [
      "10"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 27,
    "name": "十号咖啡馆 Ten Café",
    "searchKey": "十号咖啡馆",
    "station": "东山口",
    "exit": "D",
    "originalDistanceM": 450,
    "lines": [
      "1",
      "6"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 28,
    "name": "Six Sharp",
    "searchKey": "Six Sharp",
    "station": "猎德",
    "exit": "A",
    "originalDistanceM": 460,
    "lines": [
      "5"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "临江大道391号合利天德广场",
    "location": null,
    "locationSource": null
  },
  {
    "id": 29,
    "name": "无可奉告 The Secret Bar",
    "searchKey": "无可奉告",
    "station": "东湖",
    "exit": "C",
    "originalDistanceM": 380,
    "lines": [
      "6",
      "10",
      "12"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 30,
    "name": "Beerbox·江畔华庭店",
    "searchKey": "Beerbox 江畔华庭",
    "station": "广州塔",
    "exit": "B",
    "originalDistanceM": 820,
    "lines": [
      "3",
      "APM"
    ],
    "status": "unknown",
    "statusCheckedAt": "2026-10-16",
    "rating": null,
    "addressHint": "",
    "location": null,
    "locationSource": null
  },
  {
    "id": 31,
    "name": "The Happy Monk·侨鑫店",
    "searchKey": "The Happy Monk 侨鑫店",
    "station": "妇儿中心",
    "exit": "A",
    "originalDistanceM": 220,
    "lines": [
      "APM"
    ],
    "status": "listed",
    "statusCheckedAt": "2026-10-16",
    "rating": {
      "score": 4.0,
      "price": 118,
      "reviews": 2,
      "platform": "携程（较早资料）",
      "source": "https://you.ctrip.com/food/152/16095822.html"
    },
    "addressHint": "金穗路62号侨鑫国际",
    "location": null,
    "locationSource": null
  }
];
module.exports = { initialBars };
