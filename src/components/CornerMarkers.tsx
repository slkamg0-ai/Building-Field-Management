// Industry 디자인 시스템의 11x11 십자 코너 마커 장식.
// 부모 요소에 `relative corner-markers` 클래스를 추가하고 이 컴포넌트를 자식으로 넣으면
// 카드 네 모서리에 블루프린트 스타일 십자 마커가 표시된다.
export default function CornerMarkers() {
  return (
    <>
      <span className="corner-bl" />
      <span className="corner-br" />
    </>
  )
}
