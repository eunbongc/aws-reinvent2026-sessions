// reinvent/config.js — 수파베이스 접속 설정 (git 제외 대상)
// -----------------------------------------------------------------------------
// 이 파일은 .gitignore 로 커밋에서 제외된다. 제출물(PDF/캡처)에도 키 값을 넣지 않는다.
// Publishable 키는 원래 브라우저에 노출되는 공개용이며, 실제 보안은 수파베이스 RLS가 책임진다.
// (secret 키는 절대 여기에 두지 않는다 — 그건 RLS를 우회하는 관리자 키다.)
//
// 다른 환경에서 이 도구를 쓰려면 이 파일을 config.example.js 에서 복사해 값만 채운다.
// -----------------------------------------------------------------------------
window.SUPABASE_CONFIG = {
  url: "https://cnoxmjmxvelpqbzzxqnj.supabase.co",
  publishableKey: "sb_publishable_j3aaZLAi4N8JWRktH0I3Aw_XQSb3N1F",
};
