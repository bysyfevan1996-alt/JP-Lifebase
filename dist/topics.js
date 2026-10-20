export const categories = {
  housing:{label:'住房与账单',color:'#6d9c81',bg:'#edf4ee',fg:'#6e8f77'},
  visa:{label:'签证与手续',color:'#c4a16a',bg:'#f7f1e7',fg:'#a28c69'},
  work:{label:'工作与税务',color:'#8b8fbc',bg:'#efeff7',fg:'#8988a5'},
  car:{label:'汽车与出行',color:'#709fb7',bg:'#eaf2f6',fg:'#7295aa'},
  daily:{label:'日常闲聊',color:'#bd8781',bg:'#f8edeb',fg:'#b48a84'},
  site:{label:'站务与公告',color:'#9b9b9b',bg:'#f0f0f0',fg:'#8b8b8b'}
};
export const avatarColors=[['#dfe9e1','#6c8873'],['#e4e9ee','#6f839b'],['#eee4db','#a08064'],['#e6e1ec','#8d7b9c'],['#eae6dc','#9c906d'],['#e1ebea','#688d87']];
export const topics=[
{id:'welcome',title:'欢迎来到 Japan Life Base，先来认识一下彼此吧',excerpt:'新朋友可以在这里介绍自己，分享所在城市、来日本多久，以及最近关心的生活问题。提问、经验分享和日常闲聊都欢迎。',author:'小林',avatar:'林',tone:0,category:'site',pinned:true,replies:28,minutes:180,body:'欢迎来到 Japan Life Base。\n\n这里是大家交流在日生活的地方。可以提问、分享实际经验，也可以聊聊最近遇到的小事。\n\n发帖时选一个合适的分类；有地区差异的内容，请说明所在城市。涉及费用、制度或办理手续时，欢迎附上资料来源与适用时间。\n\n先来认识一下：你现在生活在哪个城市？最近想了解什么？',sampleReplies:[{author:'Mika',avatar:'M',tone:3,body:'住在大阪，来日本两年。最近在研究搬家，想听听大家的经验。'},{author:'阿森',avatar:'森',tone:0,body:'横滨报到。家里两个人，最近比较关心电费和开车的成本。'}]},
{id:'electricity',title:'两个人住 1LDK，这个月用了 300 度电，算多吗？',excerpt:'电费账单交流。坐标横滨，平时晚上在家，想了解一下相似家庭的用电量。',author:'阿森',avatar:'森',tone:0,category:'housing',replies:36,minutes:3,body:'坐标横滨，两个人住 1LDK。这期用了 300 kWh，计费期间 30 天，契约容量 40 A。平时晚上在家，做饭用电磁炉。\n\n想和居住情况相近的朋友交流一下。大家分享时能不能带上人数、房型和计费天数？单看金额好像不太容易比较。',sampleReplies:[{author:'Yuki',avatar:'Y',tone:2,body:'我们两个人住 2DK，这期 280 kWh，也是 30 天。工作日白天基本不在家。'},{author:'小林',avatar:'林',tone:0,body:'可以先比较用电量，再核对套餐和账单项目。账单截图记得遮住姓名、地址与客户编号。'}]},
{id:'move',title:'搬到新城市后，你们怎么整理待办手续？',excerpt:'下个月准备从东京搬到横滨，想把需要办理的事情列成清单。',author:'Mika',avatar:'M',tone:3,category:'visa',replies:12,minutes:8,body:'下个月准备搬家，地址变更相关的事项有点多。\n\n想问问大家有没有实际用过的整理方法，比如按搬家前、搬家当天、搬家后分成清单。具体期限和要求我会再去官方页面核对。',sampleReplies:[{author:'小周',avatar:'周',tone:1,body:'我分成项目、办理地点、截止时间、完成情况四列。每一项旁边放一个资料链接，之后核对方便。'}]},
{id:'ev',title:'没有家用充电桩，开电车的朋友平时怎么充电？',excerpt:'住公寓，停车位不能装充电桩，主要周末开车。',author:'Ken',avatar:'K',tone:1,category:'car',replies:54,minutes:16,body:'现在住公寓，停车位暂时不能装充电桩。平时主要周末开车，想听听同样没有家充的朋友的实际体验。\n\n一般在哪里充电？会不会特意绕路？想先按自己的日常路线观察一段时间。',sampleReplies:[{author:'Hiro',avatar:'H',tone:5,body:'我会先看平时购物和吃饭的地方附近有没有合适的充电点，再留意一下周末的排队情况。'}]},
{id:'rent',title:'租房看房时，除了朝向和房租，还有哪些细节要看？',excerpt:'准备换房，想提前整理一份现场检查清单。',author:'Yuki',avatar:'Y',tone:2,category:'housing',replies:23,minutes:24,body:'最近在看房，除了位置、朝向和房租，还想提前整理一份现场检查清单。\n\n比如插座位置、窗户隔音、手机信号。大家搬进去以后，有没有发现看房时没注意到的问题？',sampleReplies:[{author:'Nana',avatar:'N',tone:3,body:'我会白天晚上各走一遍回家的路线。房间里的收纳空间也建议量一下。'}]},
{id:'year-end',title:'第一次收到年末调整资料，大家都准备了些什么？',excerpt:'已经收到公司人事发的表格，想先核对资料是否齐全。',author:'小周',avatar:'周',tone:1,category:'work',replies:9,minutes:38,body:'今年第一次在公司做年末调整，已经收到人事发来的资料。\n\n想听听大家第一次填写时遇到过哪些问题。具体适用条件和填写要求我会再向人事确认。'},
{id:'walk',title:'周末一个人散步，你最喜欢哪条路线？',excerpt:'不用做攻略，走走停停就能待半天的地方。',author:'Nana',avatar:'N',tone:3,category:'daily',replies:47,minutes:52,body:'想找一个不用做太多攻略、走走停停就能待半天的地方。\n\n大家可以写下自己所在城市，以及喜欢的散步路线。有河边、公园或者小店就更好了。'},
{id:'sim',title:'换手机套餐前，有哪些费用容易被忽略？',excerpt:'最近在整理每月固定支出，先从手机套餐开始。',author:'小叶',avatar:'叶',tone:0,category:'daily',replies:18,minutes:65,body:'最近在整理每月固定支出，发现手机套餐有些选项已经很久不用了。\n\n大家换套餐之前，会重点检查哪些费用或合约条件？欢迎分享自己的核对清单。'},
{id:'visa-docs',title:'更新在留资格时，你们怎么管理提交资料的副本？',excerpt:'想把以后可能需要的材料整理好，避免下次又从头找。',author:'Lin',avatar:'L',tone:4,category:'visa',replies:7,minutes:92,body:'最近在整理以前办理手续留下的文件。\n\n想请教大家怎么给提交资料分类、命名和留存副本。具体需要哪些资料仍以官方要求为准，这个帖子主要交流整理方法。'},
{id:'used-car',title:'第一次买二手车，大家会先问店家哪些问题？',excerpt:'希望听听实际购车时的经验，尤其是费用清单怎么核对。',author:'Tomo',avatar:'T',tone:5,category:'car',replies:31,minutes:130,body:'最近准备第一次买二手车，还在做功课。\n\n想听听大家在看车、试车和确认费用清单时，会先问哪些问题。欢迎分享自己当时遗漏、后来补问的事情。'},
{id:'remote',title:'在家办公的小伙伴，怎么布置不占地方的工作区？',excerpt:'小户型，想兼顾坐姿和收纳，看看大家的布置。',author:'丸子',avatar:'丸',tone:2,category:'work',replies:15,minutes:175,body:'家里空间不大，想给在家办公留一个固定位置。\n\n大家会怎么选桌子尺寸和灯光？如果不用时能收起来就更好了。可以只分享布置思路，不用放个人住址或窗外信息。'},
{id:'heater',title:'开始用暖气前，你们会做哪些清洁和检查？',excerpt:'空调放了几个月没用，准备先清洁一下。',author:'Sora',avatar:'S',tone:1,category:'housing',replies:6,minutes:220,body:'天气转凉，准备重新开始用空调暖气。\n\n大家一般会先做哪些清洁和检查？我会先找出机器的说明书，按对应型号的要求操作。'},
{id:'bicycle',title:'每天骑自行车通勤，雨天装备怎么选？',excerpt:'通勤大约 20 分钟，希望方便收纳。',author:'Hiro',avatar:'H',tone:5,category:'car',replies:20,minutes:280,body:'平时骑自行车通勤大约 20 分钟，最近想整理雨天装备。\n\n希望到公司后方便收纳。大家可以分享使用感受和遇到的问题。'},
{id:'grocery',title:'一周买一次菜，大家怎么安排冰箱里的食材？',excerpt:'常常买多，想学一下不浪费的整理方法。',author:'美咲',avatar:'咲',tone:4,category:'daily',replies:42,minutes:330,body:'通常周末买一周的菜，但有时到周中就忘了冰箱里还有什么。\n\n想听听大家实际用过的备菜、分装和记录方法。'},
{id:'first-job',title:'刚入职第一周，有哪些想早点问清楚的事情？',excerpt:'除了工作内容，通勤和公司流程也想整理一下。',author:'Allen',avatar:'A',tone:1,category:'work',replies:0,minutes:360,body:'准备开始第一份在日本的工作。\n\n除了工作内容，大家觉得第一周可以向同事确认哪些公司流程？例如通勤申报、设备使用和请假申请的方式。'},
{id:'moving-boxes',title:'搬家纸箱太多，怎么安排打包顺序比较轻松？',excerpt:'还有三周搬家，想从不常用的东西开始。',author:'Mika',avatar:'M',tone:3,category:'housing',replies:0,minutes:420,body:'距离搬家还有三周，准备先从不常用的东西开始装箱。\n\n大家会按房间打包，还是按使用频率？有没有搬完以后找东西更方便的标记方法？'},
{id:'documents',title:'纸质文件和电子文件，你们用什么规则整理？',excerpt:'想把每年都会用到的文件集中管理。',author:'小陈',avatar:'陈',tone:0,category:'visa',replies:13,minutes:510,body:'柜子里的资料夹越来越多，想给纸质文件和扫描件统一一下命名。\n\n大家按年份、机构还是事项分类？主要想交流自己能长期坚持的整理方法。'},
{id:'internet',title:'住公寓，晚上的网络速度会明显变慢吗？',excerpt:'同一房间不同时间测速差别很大，正在逐项排查。',author:'Jun',avatar:'J',tone:4,category:'housing',replies:26,minutes:600,body:'最近发现晚上用网络时速度和白天不太一样。\n\n想听听大家会怎么一步步排查，比如有线连接、路由器位置和测试时间。欢迎分享自己的记录方式。'},
{id:'coffee',title:'分享一件让你在日本生活方便很多的小东西',excerpt:'从收纳用品到厨房工具都可以，想看真实使用体验。',author:'Nana',avatar:'N',tone:3,category:'daily',replies:68,minutes:720,body:'最近整理厨房，发现一个用了很久的小工具确实省事。\n\n大家有什么一直在用、想推荐给朋友的小东西？欢迎说明使用场景和缺点。'}
];
