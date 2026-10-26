Pod::Spec.new do |s|
  s.name = 'RadioStarSleep'
  s.version = '1.0.0'
  s.summary = 'Local deadlines for the existing Radio Star Expo audio player'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Radio Star'
  s.homepage = 'https://github.com/pH7-dispensary/radiostar'
  s.source = { :git => s.homepage }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoAudio'
  s.source_files = '**/*.swift'
end
