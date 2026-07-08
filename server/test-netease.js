const {
  neteaseSearch,
  neteaseSongUrl,
  neteaseLyric,
} = require('./netease');

async function test() {
  console.log('=== Netease API Phase 1.5 自检 ===\n');

  // 1. 搜索测试
  console.log('[1] 搜索测试: keyword=周杰伦, limit=5');
  try {
    const searchRes = await neteaseSearch('周杰伦', 5);
    console.log(`  code: ${searchRes.code}`);
    console.log(`  total: ${searchRes.total}`);
    console.log(`  songs: ${searchRes.data.length}`);
    if (searchRes.data.length > 0) {
      const s = searchRes.data[0];
      console.log(`  first song: id=${s.id}, name=${s.name}, fee=${s.fee}`);
    }
    console.log('  ✅ 搜索正常\n');
  } catch (e) {
    console.log(`  ❌ 搜索失败: ${e.message}\n`);
  }

  // 2. 普通歌曲 URL
  console.log('[2] 普通歌曲 URL: id=5257138 (屋顶)');
  try {
    const urlRes = await neteaseSongUrl('5257138');
    console.log(`  code: ${urlRes.code}`);
    console.log(`  url: ${urlRes.data?.url ? urlRes.data.url.slice(0, 60) + '...' : 'null'}`);
    console.log(`  br: ${urlRes.data?.br}`);
    console.log(`  ${urlRes.code === 200 ? '✅' : '❌'} URL ${urlRes.code === 200 ? '正常' : '失败'}\n`);
  } catch (e) {
    console.log(`  ❌ URL 获取失败: ${e.message}\n`);
  }

  // 3. VIP 歌曲 URL（测试游客限制）
  console.log('[3] VIP 歌曲 URL: id=2130946019');
  try {
    const vipRes = await neteaseSongUrl('2130946019');
    console.log(`  code: ${vipRes.code}`);
    console.log(`  url: ${vipRes.data?.url ? vipRes.data.url.slice(0, 60) + '...' : 'null'}`);
    console.log(
      `  ${vipRes.code === 200 ? '✅ 游客可播放' : '❌ 游客不可播放（需登录后 Phase 2 再测）'}\n`,
    );
  } catch (e) {
    console.log(`  ❌ VIP URL 测试失败: ${e.message}\n`);
  }

  // 4. 歌词测试
  console.log('[4] 歌词测试: id=5257138');
  try {
    const lyricRes = await neteaseLyric('5257138');
    console.log(`  code: ${lyricRes.code}`);
    console.log(`  lyric length: ${lyricRes.data?.length || 0} chars`);
    console.log(
      `  ${lyricRes.code === 200 && lyricRes.data.length > 0 ? '✅' : '❌'} 歌词 ${
        lyricRes.code === 200 && lyricRes.data.length > 0 ? '正常' : '失败'
      }\n`,
    );
  } catch (e) {
    console.log(`  ❌ 歌词测试失败: ${e.message}\n`);
  }

  console.log('=== 自检完成 ===');
}

test().catch(console.error);
